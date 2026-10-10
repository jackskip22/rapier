// SPDX-License-Identifier: MIT
import {finish, finishAsync, cloneTree, cleanTree, serializeTree, encodeUtf8Steps, pause} from './render-work.mjs';
// The document's renderer. DOM, codecs and host state are explicit inputs.
function createRenderer(runtime) {
  const {RAPIER_COLOR_CLOSE, RapierLedgerCarried, RapierPageReturnAddress, RapierTextCodec, _rapierArtifactHighlight, _rapierArtifactPreference, _rapierArtifactStyles, _rapierBlobDataUrl, _rapierBuildInterchangeContext, _rapierDocumentNameIsAdmissible, _rapierLedgerParts, _rapierDrawReadSVGRecipe, _rapierDrawShapeProfileFor, _rapierExportFontCss, _rapierFillDiagram, _rapierFinalizeExportCode, _rapierFormatColorOpen, _rapierLanguageClass, _rapierLineStartOffsets, _rapierMarkdownEnvironment, _rapierPortableHtml, _rapierPrepareInterchangeContext, _rapierProjectPortableRoot, _rapierProviders, _rapierSourceCharEscaped, _rapierSourceLineSpan, crypto, document, escapeRapierHtmlText, globalThis, rapierConfirm, sanitizeRapierHtml} = runtime;
  let md = runtime.md;
  async function render(source, options = {}) {
    if (typeof source !== 'string') throw new TypeError('Document source must be a string');
    const filename = options.filename || 'document.md';
    if (typeof filename !== 'string' || !filename || /[\\/\u0000-\u001f\u007f]/.test(filename)) throw new TypeError('Invalid document filename');
    const bom = source.charCodeAt(0) === 0xfeff;
    const canonical = RapierTextCodec.normalizeDocument(source);
    const captured = {canonical, metadata: {filename, docKind: options.docKind || 'markdown', codeLang: options.codeLang || '', bom}, baseName: filename.replace(/\.[^.]*$/, '') || 'document'};
    const written = await _rapierBuildSharedPage(captured);
    return {html: await written.blob.text(), filename: written.filename};
  }
async function _rapierBuildArtifact(options, providedContext) {
	const opts = options || {};
	const context = providedContext || _rapierBuildInterchangeContext(opts);
	const metadata = context.metadata;
	const base = context.baseName;
	const work = context.work || opts.work;

	if (opts.kind === 'publishing' || opts.kind === 'fragment') {
		for (const diagram of context.semanticRoot.querySelectorAll('.diagram-block[data-diagram-native]'))
			await _rapierFillDiagram(diagram, true);
		const portableRoot = work ? await runtime._rapierProjectPortableRootAsync(context.semanticRoot, {baseName: base, keepDiagrams: true, work})
			: _rapierProjectPortableRoot(context.semanticRoot, { baseName: base, keepDiagrams: true });
		return {
			html: work ? await runtime._rapierPortableHtmlAsync(portableRoot, work) : _rapierPortableHtml(portableRoot),
			filename: base + '-publishing.html',
			metadata,
		};
	}

	// The semantic export root is detached and has never entered the live visibility queue.
	// Await the same materialization owner before any projection clones or serializes it.
	for (const diagram of opts.kind === 'page' ? [] : context.semanticRoot.querySelectorAll('.diagram-block[data-diagram-src]')) {
		await _rapierFillDiagram(diagram, true);
		if (opts.kind !== 'standalone' || diagram.hasAttribute('data-diagram-unclosed')) continue;
		const state = diagram.getAttribute('data-diagram-state');
		// A completed diagram must have its drawing. Syntax and renderer failures both refuse
		// the file; an unclosed fence above is still authored source, not a completed diagram.
		if (state !== 'ready' || !diagram.querySelector('.diagram-cache svg'))
			throw Object.assign(new Error('Web page not written; a required diagram could not be rendered'), {code: 'EXPORT_DIAGRAM_UNAVAILABLE'});
	}

	if (opts.kind === 'standalone') {
		if (context.semanticRoot.querySelector('.math-placeholder'))
			throw new Error('Web page not written; the math plug-in is required to include its equations');
		// MathJax represents invalid TeX as a static error SVG. A source-only span means
		// rendering itself failed, so publishing it would silently omit the equation.
		if (context.semanticRoot.querySelector('span[data-rapier-math-source]'))
			throw new Error('Web page not written; a required equation could not be rendered');
	}
	if (opts.kind === 'standalone' || opts.kind === 'page') await _rapierRequireOfflinePageImages(context.semanticRoot);

	const styledOptions = {metadata, print: !!opts.print, sourceCode: opts.kind === 'page', baseName: base, work};
	const styledRoot = work ? await _rapierProjectStyledRootAsync(context.semanticRoot, styledOptions)
		: _rapierProjectStyledRoot(context.semanticRoot, styledOptions);
	if (opts.kind === 'standalone' && typeof _rapierFinalizeExportCode === 'function') await _rapierFinalizeExportCode(styledRoot);
	// _rapierProjectStyledRoot already returns the sanitized projection.
	// Print never emits the layout reflow script (see below), so a print artifact has no use for
	// this annotation -- skip it there rather than pay the cost for numbers nothing will read.
	if (!opts.print && opts.kind !== 'page') _rapierAnnotateExportBoxPolygons(styledRoot);
	// Share adds its nearest-side no-script float and long-code cap here. Offline-image
	// admission above and the page policy below belong to this common writer, not its callers.
	if (typeof opts.afterRoot === 'function') await opts.afterRoot(styledRoot);
	const carrier = opts.kind === 'standalone' ? await _rapierSharedSourceCarrier(context, styledRoot) : '';
	const bodyHtml = opts.kind === 'page' ? _rapierPageHtml(styledRoot) : work
		? await finishAsync(serializeTree(styledRoot), work) : styledRoot.innerHTML;
	if (work) await pause(work, .95);
	const theme = opts.print
		? 'light'
		: opts.kind === 'page' ? 'system'
		: _rapierArtifactPreference('theme', ['system', 'light', 'dark']);
	const highlights = opts.kind === 'page' ? 'standard' : _rapierArtifactPreference('highlights', ['accent', 'standard']);
	const versionMeta = document.querySelector('meta[name="rapier-version"]');
	const version = versionMeta && versionMeta.content ? versionMeta.content.trim() : '0.0.0';
	const bodyClass = theme === 'light' ? 'light' : '';
	const docClass = metadata.docKind === 'markdown'
		? 'rapier-page md-render'
		: 'rapier-page rapier-document--flat';
	// Rapier's own stylesheet, not a lookalike: the theme frame, spec/markdown-style.css's whole
	// .md-render set and the highlight rules, so a numbered list, a checkbox, a callout and a
	// table are drawn in an exported page exactly as they are drawn here. The one caller with
	// rules of its own -- Share, for the no-script float it alone writes -- appends them.
	const includeFonts = !!opts.print || opts.kind === 'standalone';
	const zenFontCss = opts.print && styledRoot.querySelector('svg[aria-roledescription="zenuml"]')
		? (_rapierProviders?.mermaid?.exportFontCss?.() || '') : '';
	const willFont = opts.print && opts.willFont ? opts.willFont : null;
	const settings = _rapierDocumentSettingsOf(context.canonical);
	const settingsCss = _rapierDocumentSettingsCss(settings);
	const pageTitle = settings && settings.title ? globalThis.RapierMarkdownSpec.documentTitle(settings) : metadata.filename;
	let css = _rapierArtifactStyles(theme, includeFonts, !!opts.print || opts.kind === 'standalone', opts.kind === 'page', opts.kind === 'standalone' ? '' : null)
		+ (zenFontCss ? '\n\n' + zenFontCss : '')
		+ (opts.extraCss ? '\n\n' + opts.extraCss : '')
		+ (willFont ? '\n\n@font-face{font-family:' + willFont.family + ';src:url(' + await _rapierBlobDataUrl(new Blob([willFont.bytes], { type: 'font/ttf' })) + ') format("truetype")}' : '')
		+ (settingsCss ? '\n' + settingsCss : '');
	// Match the document's measured faces with only the glyphs this immutable page uses.
	if (opts.kind === 'standalone') {
		const fonts = await _rapierExportFontCss(styledRoot, {settings, css, theme});
		if (fonts) css += '\n' + fonts;
	}
	// Every written page is offline. Only the writer's nonce script may run; it, pictures,
	// styles and other page resources get no network authority. Following an ordinary link
	// is the reader's navigation, with no Referer, not a background resource request.
	const nonce = _rapierArtifactNonce();
	// The reflow script is written first, because whether it exists decides the policy. A page that carries no script says so: script-src 'none' refuses every
	// script outright. Declaring a nonce a page has no use for is a widening, small but real -- anything that could inject markup into the file could read the
	// nonce out of it and be admitted.
	const layoutScript = !opts.print && opts.kind !== 'page' ? _rapierArtifactLayoutScript(styledRoot, nonce) : '';
	const inkScript = !opts.print && opts.kind !== 'page' ? _rapierArtifactInkScript(styledRoot, nonce) : '';
	const page = '<!DOCTYPE html>\n'
		+ '<html lang="en" data-rapier-theme="' + theme + '" data-highlights="' + highlights + '">\n'
		+ '<head>\n<meta charset="UTF-8">\n' + (carrier ? RapierPageReturnAddress.PAGE_SEED + '\n' : '')
		+ '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
		// Chrome 154's responsively sized frames: a host frame styled `frame-sizing: content-height` sizes
		// itself to a page that opts in with this meta, so a document exported from Rapier and carried in
		// someone's page shows whole, with no inner scroll. Any origin may read the height: the page is the
		// document, published by the person who exported it.
		+ '<meta name="responsive-embedded-sizing" content="allow-origins=*">\n'
		+ '<meta http-equiv="Content-Security-Policy" content="' + _rapierExportedPageCsp(layoutScript || inkScript ? nonce : '', includeFonts) + '">\n'
		+ '<meta name="referrer" content="no-referrer">\n'
		+ '<link rel="icon" href="data:,">\n'
		+ '<meta name="generator" content="Rapier ' + escapeRapierHtmlText(version) + '">\n'
		+ '<title>' + escapeRapierHtmlText(pageTitle) + '</title>\n'
		+ '<style>' + css + '</style>\n</head>\n'
		+ '<body class="' + bodyClass + '"><main class="' + docClass + '" data-md-theme="' + theme + '">'
		+ bodyHtml + '</main>' + carrier + layoutScript + inkScript + '</body>\n</html>';

	return {
		html: page,
		filename: base + '.html',
		bodyHtml,
		css,
		docClass,
		metadata,
		documentTitle: settings && settings.title ? pageTitle : '',
	};
}

// Page files have one byte representation across native and inert DOM hosts. Attribute
// insertion order and a host's optional entity escapes are not document content.
function _rapierPageHtml(root) {
	const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
	const children = node => Array.from(node.childNodes || [], write).join('');
	function write(node) {
		if (node.nodeType === 3) return escapeRapierHtmlText(node.nodeValue || '');
		if (node.nodeType !== 1) return '';
		// This writer emits text/html; the HTML reader restores SVG's camel-cased names.
		const tag = node.localName.toLowerCase();
		const attributes = Array.from(node.attributes).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
			.map(attribute => ' ' + attribute.name + '="' + escapeRapierHtmlText(attribute.value) + '"').join('');
		const open = '<' + tag + attributes + '>';
		return voidTags.has(tag) ? open : open + children(node) + '</' + tag + '>';
	}
	return children(root);
}

function _rapierProjectStyledRoot(semanticRoot, options) { return finish(_rapierProjectStyledRootSteps(semanticRoot, options)); }
async function _rapierProjectStyledRootAsync(semanticRoot, options = {}) { return finishAsync(_rapierProjectStyledRootSteps(semanticRoot, options), options.work); }

function* _rapierProjectStyledRootSteps(semanticRoot, options) {
	const opts = options || {};
	const root = yield* cloneTree(semanticRoot);
	const metadata = opts.metadata || {};

	if (metadata.docKind !== 'markdown') {
		const pre = root.querySelector('pre');
		const code = pre && pre.querySelector(':scope > code');
		if (pre) {
			pre.className = 'artifact-flat ' + (metadata.docKind === 'code'
				? 'artifact-flat--code'
				: 'artifact-flat--text');
		}
		if (code) {
			const lang = _rapierLanguageClass(code) || String(metadata.codeLang || '');
			code.classList.add('artifact-code');
			if (metadata.docKind === 'code' && !opts.sourceCode) _rapierPaintCode(code, _rapierArtifactHighlight(code.textContent || '', lang));
			if (lang) code.classList.add('language-' + String(lang).replace(/[^a-z0-9_-]/gi, ''));
		}
	} else {
		for (const code of root.querySelectorAll('pre > code')) { yield;
			if (opts.sourceCode || code.parentElement?.classList.contains('diagram-source') &&
					code.closest('.diagram-block')?.getAttribute('data-diagram-state') === 'ready') continue;
			const lang = _rapierLanguageClass(code) || 'text';
			_rapierPaintCode(code, _rapierArtifactHighlight(code.textContent || '', lang));
		}

		for (const table of root.querySelectorAll('table')) { yield;
			if (table.parentElement && table.parentElement.classList.contains('table-scroll-wrap')) continue;
			const wrap = document.createElement('div');
			wrap.className = 'table-scroll-wrap';
			table.parentNode.insertBefore(wrap, table);
			wrap.appendChild(table);
		}

		for (const math of root.querySelectorAll('math[display="block"]')) { yield;
			if (math.closest('svg') || math.closest('.math-display-wrap')) continue;
			const wrap = document.createElement('span');
			wrap.className = 'math-display-wrap';
			math.parentNode.insertBefore(wrap, math);
			wrap.appendChild(math);
		}

		for (const input of root.querySelectorAll('input[type="checkbox"]')) { yield;
			const item = input.closest('.task-list-item');
			input.disabled = !!opts.print || !item;
			if (input.disabled) { input.setAttribute('aria-disabled', 'true'); continue; }
			// Native checked state changes this reader's view, never the carried source or disk.
			input.removeAttribute('aria-disabled');
			input.removeAttribute('aria-checked');
			input.setAttribute('autocomplete', 'off');
			input.setAttribute('title', 'Ticks change this view, not the saved file.');
			const label = item.cloneNode(true);
			for (const node of label.querySelectorAll('input,ul,ol')) { yield;node.remove();}
			input.setAttribute('aria-label', String(label.textContent || '').replace(/\s+/g, ' ').trim() || 'Task');
		}

		if (opts.print) for (const details of root.querySelectorAll('details')) { yield; details.open = true; }
	}

	yield* _rapierPrefixPortableAnchorsSteps(root, opts.baseName || metadata.filename || 'document');

	return yield* cleanTree(root, sanitizeRapierHtml, opts.sourceCode ? 'source' : 'export');
}

function _rapierPaintCode(el, html) {
	el.innerHTML = html;
	el.classList.add('tok');
}

function _rapierPrefixPortableAnchors(root, baseName) { return finish(_rapierPrefixPortableAnchorsSteps(root, baseName)); }

function* _rapierPrefixPortableAnchorsSteps(root, baseName) {
	const slug = String(baseName || 'document').toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'document';
	const prefix = 'rapier-' + slug + '-';
	const ids = new Map(), svgIds = new Map();
	const used = new Set();
	const scopeOf = element => {
		// querySelectorAll('*') hands back whatever the host document holds, and not every host gives
		// each node Element.closest -- the export writer runs against parsed and stubbed documents as
		// well as a browser's. Without this guard the whole anchor pass would throw TypeError. No scope
		// simply means that node's references resolve document-wide, as an unscoped drawing's do.
		if (typeof element?.closest !== 'function') return null;
		let svg = element.closest('svg');
		while (typeof svg?.parentElement?.closest === 'function' && svg.parentElement.closest('svg')) svg = svg.parentElement.closest('svg');
		return svg;
	};

	for (const element of root.querySelectorAll('[id]')) { yield;
		const oldId = element.id;
		if (!oldId) continue;
		const base = oldId.replace(/[^a-z0-9_-]+/gi, '-')
			.replace(/^-+|-+$/g, '') || 'anchor';
		let nextId = prefix + base;
		let suffix = 2;
		while (used.has(nextId)) nextId = prefix + base + '-' + suffix++;
		used.add(nextId);
		// A document link resolves the first matching anchor, as it did before renaming.
		// SVG references resolve within their own drawing, never the last repeated drawing.
		if (!ids.has(oldId)) ids.set(oldId, nextId);
		const svg = scopeOf(element);
		if (svg) {
			let local = svgIds.get(svg);
			if (!local) svgIds.set(svg, local = new Map());
			if (!local.has(oldId)) local.set(oldId, nextId);
		}
		element.id = nextId;
	}

	for (const element of root.querySelectorAll('*')) { yield;
		const svg = scopeOf(element), local = svgIds.get(svg);
		const rewriteId = value => (svg ? local?.get(value) : ids.get(value)) || '';
		// URL fragments percent-decode once; ARIA/for/headers are literal IDREFs.
		const decodeFragment = value => { try { return decodeURIComponent(value); } catch (_) { return value; } };
		const iriProperty = /^(?:fill|stroke|filter|clip-path|mask|marker(?:-start|-mid|-end)?|cursor)$/;
		const rewriteUrls = value => value.replace(/url\(\s*(?:"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)'|((?:\\(?:[0-9a-f]{1,6}\s?|[^\r\n\f])|[^\s\\()])+))\s*\)/gi, (whole, double, single, bare) => {
			const target = (double ?? single ?? bare).replace(/\\(?:([0-9a-f]{1,6})(?:\r\n|[ 	\r\n\f])?|([\s\S]))/gi, (escape, hex, plain) => {
				const point = hex && parseInt(hex, 16);
				return hex ? (point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '\ufffd') : plain;
			});
			const mapped = target[0] === '#' && rewriteId(decodeFragment(target.slice(1)));
			return mapped ? 'url(#' + mapped + ')' : whole;
		});
		for (const attribute of Array.from(element.attributes)) {
			const name = attribute.name, value = attribute.value;
			if (name === 'href' || name === 'xlink:href') {
				const fragment = value.slice(1), decoded = decodeFragment(fragment);
				const navigation = element.localName === 'a' || element.localName === 'area';
				const next = value[0] === '#' && (navigation
					? rewriteId(fragment) || rewriteId(decoded) || ids.get(fragment) || ids.get(decoded)
					: rewriteId(svg ? decoded : fragment));
				if (next) element.setAttribute(name, '#' + next);
			} else if (name === 'for' || name === 'list') {
				const next = rewriteId(value);
				if (next) element.setAttribute(name, next);
				else element.removeAttribute(name);
			} else if (name === 'headers' || name === 'aria-labelledby' || name === 'aria-describedby') {
				const next = value.trim().split(/\s+/).map(rewriteId).filter(Boolean).join(' ');
				if (next) element.setAttribute(name, next);
				else element.removeAttribute(name);
			} else if (svg && name === 'style') {
				// Interpret only URL-bearing presentation properties: content/metadata strings
				// that merely SAY "url(#id)" are not a reference and retain their own words.
				for (const property of Array.from(element.style)) {
					if (!iriProperty.test(property)) continue;
					const before = element.style.getPropertyValue(property), next = rewriteUrls(before);
					if (next !== before) element.style.setProperty(property, next, element.style.getPropertyPriority(property));
				}
			} else if (svg && iriProperty.test(name)) {
				const next = rewriteUrls(value);
				if (next !== value) element.setAttribute(name, next);
			}
		}
	}
}

function _rapierDocumentSettingsOf(canonical) {
	const spec = globalThis.RapierMarkdownSpec;
	if (!spec || typeof spec.readDocumentSettings !== 'function') return null;
	try { return spec.readDocumentSettings(String(canonical || '')); }
	catch (_) { return null; }
}

function _rapierDocumentSettingsCss(settings) {
	const spec = globalThis.RapierMarkdownSpec;
	if (!settings || !spec || typeof spec.documentSettingsStyle !== 'function') return '';
	const style = spec.documentSettingsStyle(settings) || '';
	const page = typeof spec.documentSettingsPageRule === 'function' ? spec.documentSettingsPageRule(settings) : null;
	return style && page ? style + '\n' + page : style || page || '';
}

function _rapierExportedPageCsp(nonce, fonts) {
	return "default-src 'none'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'; "
		+ (fonts ? "font-src data:; " : '')
		+ "script-src " + (nonce ? "'nonce-" + nonce + "'" : "'none'") + "; base-uri 'none'; form-action 'none'";
}

function _rapierArtifactNonce() {
	const bytes = new Uint8Array(18);
	crypto.getRandomValues(bytes);
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _rapierAnnotateExportBoxPolygons(root) {
	for (const image of root.querySelectorAll('img[data-rapier-image-layout]')) {
		const layout = globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
		if (layout?.wrap !== 'box' && layout?.wrap !== 'around') continue;
		const match = /^data:image\/svg\+xml;base64,([A-Za-z0-9+/]+=*)$/.exec(image.getAttribute('src') || '');
		if (!match) continue;
		let text;
		try { text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(match[1]), c => c.charCodeAt(0))); }
		catch (_) { continue; }
		let recipe;
		try { recipe = _rapierDrawReadSVGRecipe(text); } catch (_) { continue; }
		if (!recipe) continue;
		const view = recipe.view && recipe.view.w > 0 && recipe.view.h > 0 ? recipe.view : { x: 0, y: 0, w: recipe.canvas.w, h: recipe.canvas.h };
		if (layout.wrap === 'around') {
			// One occupancy for live view and export: the drawing's own profile -- closed faces reserved,
			// open strokes as ribbons, labels as boxes -- computed from the same recipe the live view
			// reads, sampled into bands the exported page reads back (layout/model.mjs parseProfile). Text
			// and paint shapes need rendered pixels for their glyph silhouettes, so the live editor's own
			// <img> supplies those when it can be found; a raster or a foreign SVG writes nothing and the
			// export measures alpha, as the live view does.
			try {
				let glyphs = null;
				if (recipe.shapes.some(shape => shape.recognized === 'text' || shape.recognized === 'paint' || shape.label)) {
					const src = image.getAttribute('src') || '';
					const live = [...document.querySelectorAll('#editor-blocks img[data-rapier-markdown-image]')].find(candidate => candidate.getAttribute('src') === src || candidate.currentSrc === src);
					glyphs = live ? globalThis.RapierImageLayout.alphaProfile(live) : null;
				}
				const profile = typeof _rapierDrawShapeProfileFor === 'function' ? _rapierDrawShapeProfileFor(recipe, glyphs) : null;
				const serialized = profile ? globalThis.RapierImageLayout.serializeProfile(profile) : '';
				if (serialized) image.setAttribute('data-rapier-occupancy', serialized);
			} catch (_) {}
			continue;
		}
		const corners = globalThis.RapierDrawEdit?.contentTiltBox(recipe);
		if (!corners || corners.length < 3) continue;
		const normalized = corners.map(([x, y]) => [(x - view.x) / view.w, (y - view.y) / view.h]);
		if (normalized.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) continue;
		const round = value => Math.round(value * 1e6) / 1e6;
		image.setAttribute('data-rapier-box-polygon', normalized.map(([x, y]) => round(x) + ' ' + round(y)).join(' '));
	}
}

async function _rapierSharedSourceHash(source, work = null) {
	const bytes = work ? await finishAsync(encodeUtf8Steps(source), work) : new TextEncoder().encode(source);
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
	return Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
}

function _rapierSharedSourceForms(source, root, substitutions) { return finish(_rapierSharedSourceFormsSteps(source, root, substitutions)); }
async function _rapierSharedSourceFormsAsync(source, root, substitutions, work) {
	const destinations = await _rapierDataImageDestinationsAsync(source, work);
	return finishAsync(_rapierSharedSourceFormsSteps(source, root, substitutions, destinations), work);
}
function* _rapierSharedSourceFormsSteps(source, root, substitutions, preparedDestinations = null) {
	const assets = globalThis.RapierImageAssets;
	const destinations = (preparedDestinations || _rapierImageDestinations(source, url => !!assets.dataImage(url))).sort((a, b) => b.start - a.start);
	const byUrl = new Map(), ids = new Map(), labels = new Map();
	for (const node of root.querySelectorAll('[id]')) ids.set(node.id, (ids.get(node.id) || 0) + 1);
	for (const match of source.matchAll(/^ {0,3}\[([^\]\r\n]+)\]:[ \t]*(data:image\/\S+)/gim)) if (!labels.has(match[2])) labels.set(match[2], match[1]);
	for (const image of root.querySelectorAll('img[src^="data:image/" i]')) {
		const url = image.getAttribute('src');
		if (!assets.dataImage(url) || byUrl.has(url)) continue;
		byUrl.set(url, image);
	}
	let resolved = source;
	const carrierEdits = [];
	const used = [], definitions = [];
	for (const row of destinations) {
		yield;
		const shownUrl = substitutions?.get(row.destination) || row.destination;
		const image = byUrl.get(shownUrl);
		if (!image) { if (shownUrl !== row.destination) { resolved = resolved.slice(0, row.start) + shownUrl + resolved.slice(row.end); carrierEdits.push({start: row.start, end: row.end, text: _rapierSharedEncode(shownUrl)}); } continue; }
		let id = image.id;
		if (!id || ids.get(id) !== 1 || !_RAPIER_SHARED_ID.test(id)) {
			const label = labels.get(row.destination);
			id = label && _RAPIER_SHARED_ID.test(label) && !ids.has(label) ? label : null;
			for (let number = 1; !id || ids.has(id); number++) id = 'image-' + number;
			image.id = id;
			ids.set(id, 1);
		}
		if (!used.includes(id)) used.push(id);
		if (row.reference && !definitions.includes(row.reference)) definitions.push(row.reference);
		resolved = resolved.slice(0, row.start) + shownUrl + resolved.slice(row.end);
		carrierEdits.push({start: row.start, end: row.end, text: '#' + id});
	}
	let carried = '', cursor = source.length;
	for (const edit of carrierEdits) {
		yield;
		carried = edit.text + (yield* _rapierSharedEncodeSteps(source.slice(edit.end, cursor))) + carried;
		cursor = edit.start;
	}
	carried = (yield* _rapierSharedEncodeSteps(source.slice(0, cursor))) + carried;
	return { resolved, carried, ids: used, definitions };
}

async function _rapierSharedSourceCarrier(context, root) {
	const source = (context.metadata.bom ? '\uFEFF' : '') + context.canonical;
	const forms = context.work ? await _rapierSharedSourceFormsAsync(source, root, context.imageSubstitutions, context.work)
		: _rapierSharedSourceForms(source, root, context.imageSubstitutions);
	const esc = escapeRapierHtmlText;
	return '<script type="' + _RAPIER_SHARED_SOURCE_TYPE + '" data-filename="' + esc(context.metadata.filename) +
		'" data-kind="' + esc(context.metadata.docKind) + '" data-sha256="' + await _rapierSharedSourceHash(forms.resolved, context.work) +
		'"' + (forms.ids.length ? ' data-images="' + forms.ids.join(' ') + '"' : '') +
		(forms.definitions.length ? ' data-image-definitions="' + forms.definitions.map(encodeURIComponent).join(' ') + '"' : '') + '>\n' +
		forms.carried + '\n</script>\n' +
		// The optional edit ledger: carried only when the host binds its owner; a host without one writes none.
		(RapierLedgerCarried ? RapierLedgerCarried.writeParts(forms.resolved, _rapierLedgerParts(forms.resolved, context.ledger, context.carried)) +
			RapierLedgerCarried.writeBase(forms.resolved, context.comparisonBase) : '');
}

function _rapierSharedResolve(text, ids, images, definitions) {
	if (!ids.length) return { text, broken: false };
	const id = '(' + ids.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')';
	let broken = false;
	const src = value => {
		const found = images.get(value);
		if (typeof found !== 'string' || !/^data:image\/(?:png|jpeg|webp|svg\+xml|jxl);base64,[A-Za-z0-9+/]+={0,2}$/i.test(found)) { broken = true; return null; }
		return found;
	};
	// Authored # characters were encoded. A raw id after ]( can only be a structural
	// substitution; matching its destination lets nested alt brackets survive unchanged.
	const inline = new RegExp('(\\]\\([ \\t\\r\\n]*(?:&lt;)?)#' + id + '(?=>?[ \\t\\r\\n]*\\)|>?[ \\t\\r\\n]+["\'(])', 'g');
	const definition = new RegExp('(^ {0,3}\\[((?:\\\\.|[^\\]\\\\])+)\\]:[ \\t]*(?:(?:\\r\\n|\\r|\\n)[ \\t]*)?(?:&lt;)?)#' + id + '(?=>?[ \\t]*$|>?[ \\t]+["\'(])', 'gm');
	const swapInline = (match, lead, value) => { const found = src(value); return found == null ? match : lead + found; };
	const swapDefinition = (match, lead, label, value) => {
		if (!definitions.has(md.utils.normalizeReference(_rapierSharedDecode(label)))) return match;
		const found = src(value);
		return found == null ? match : lead + found;
	};
	return { text: text.replace(inline, swapInline).replace(definition, swapDefinition), broken };
}

async function _rapierReadSharedDocument(text, filename) {
	const html = String(text);
	if (!/\.html?$/i.test(filename || '') || !html.includes('type="' + _RAPIER_SHARED_SOURCE_TYPE + '"')) return null;
	// Template contents remain inert, including pictures and scripts in ordinary HTML.
	const template = document.createElement('template');
	template.innerHTML = html;
	const invalid = () => { throw new Error('The editable source in this web page is incomplete or changed'); };
	const carriers = Array.from(template.content.querySelectorAll('script[type="' + _RAPIER_SHARED_SOURCE_TYPE + '"]')).filter(row => row.id !== 'rapier-base');
	if (carriers.length !== 1) return invalid();
	const carrier = carriers[0];
	const name = carrier.getAttribute('data-filename') || '', kind = carrier.getAttribute('data-kind'), sha256 = carrier.getAttribute('data-sha256') || '';
	const ids = (carrier.getAttribute('data-images') || '').split(/\s+/).filter(Boolean);
	const definitionTokens = (carrier.getAttribute('data-image-definitions') || '').split(/\s+/).filter(Boolean);
	if (!_rapierDocumentNameIsAdmissible(name) || !['markdown', 'text', 'code'].includes(kind) || !/^[0-9a-f]{64}$/.test(sha256) ||
			ids.some(id => !_RAPIER_SHARED_ID.test(id)) || definitionTokens.some(token => !_RAPIER_SHARED_DEFINITION.test(token))) return invalid();
	// Only a definition the page declares is an image definition.
	let definitions;
	try { definitions = new Set(definitionTokens.map(decodeURIComponent)); } catch (_) { return invalid(); }
	let source = carrier.textContent;
	if (source.startsWith('\n')) source = source.slice(1);
	if (source.endsWith('\n')) source = source.slice(0, -1);
	source = source.replace(/&#13;/g, '\r');
	// A duplicate id (two <img id="…">) is ambiguous, so it is recorded as null rather than either
	// src -- ties into _rapierSharedResolve's `broken` check the same way a missing image does.
	const images = new Map();
	for (const element of template.content.querySelectorAll('img[id]')) images.set(element.id, images.has(element.id) ? null : element.getAttribute('src'));
	const resolved = _rapierSharedResolve(source, ids, images, definitions);
	source = _rapierSharedDecode(resolved.text);
	if (resolved.broken || source.length > RapierTextCodec.maxDocumentBytes || await _rapierSharedSourceHash(source) !== sha256) return invalid();
	const bom = source.charCodeAt(0) === 0xFEFF;
	if (RapierTextCodec.normalizeDocument(source) !== (bom ? source.slice(1) : source)) return invalid();
	const parts = RapierLedgerCarried ? RapierLedgerCarried.readParts(source, Array.from(template.content.querySelectorAll('#rapier-ledger, #rapier-authorship'))) : {};
	const comparisonBase = RapierLedgerCarried?.readBaseElements(Array.from(template.content.querySelectorAll('#rapier-base'))) || null;
	return {source, filename: name, kind, bom, ...parts, comparisonBase};
}

function _rapierSharedPageFallbackCss() {
	return `
.rapier-page{display:flow-root}
.rapier-page>:first-child{margin-top:0}
.md-render h1{display:flow-root}
.rapier-page>:is(pre,table,hr,figure,.table-scroll-wrap,.math-display-wrap){clear:both}
`;
}

function _rapierShareWrapKind(element) {
	if (globalThis.RapierMarkdownLayout.wrapTextBlock(element)) return 'prose';
	const image = element.tagName === 'P' ? element.querySelector('img') : null;
	if (image && globalThis.RapierImageLayout.imageOnly(element, image)) return 'picture';
	// An empty paragraph is transparent to the owner search, as in the editor and the export.
	if (element.tagName === 'P' && !element.textContent.trim() && !image) return 'metadata';
	return null;
}

function _rapierSharePictureParagraph(image) {
	const occurrence = image.parentElement.tagName === 'A' ? image.parentElement : image;
	if (occurrence !== image && (occurrence.children.length !== 1 || occurrence.textContent.trim())) return null;
	const paragraph = occurrence.parentElement;
	if (!paragraph || paragraph.tagName !== 'P' || paragraph.children.length !== 1 || paragraph.textContent.trim()) return null;
	return paragraph;
}

function _rapierSharedPageLayout(root) { return finish(_rapierSharedPageLayoutSteps(root)); }
function* _rapierSharedPageLayoutSteps(root) {
	// Owner search (wrapNeighbour) reads the sibling chain live, and applying one assignment
	// splices the tree -- moving the owner into a new container moves it out of the very chain
	// a later picture's own search would walk, and a barrier-free skip past an earlier picture
	// can land on that new container instead (it is not a <p>, so it reads as a barrier). So
	// every owner is resolved first, against the one original, unspliced tree, in a pass that
	// only reads; only once all of them are known does a second pass apply any of them. Same
	// two-phase shape as layout/interchange.js's reflow(), which resolves every picture's owner
	// from one upfront `[...root.children]` before it changes anything about any of them.
	const assignments = [];
	for (const image of root.querySelectorAll('img[data-rapier-image-layout]')) {
		yield;
		const layout = globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
		if (layout?.wrap !== 'around' && layout?.wrap !== 'box') continue;
		const paragraph = _rapierSharePictureParagraph(image);
		if (!paragraph) continue;
		// Prefer following text, then preceding text, looking past pictures and metadata.
		const owner = globalThis.RapierMarkdownLayout.wrapNeighbour(paragraph, _rapierShareWrapKind);
		if (owner) assignments.push({image, paragraph, layout, owner});
	}
	// A float affects every line box after it in the same flow, which is the wrap law: prose and
	// headings carry on beside the picture across a heading or section boundary as though the blocks
	// between were not there. So the picture paragraph is placed right before its owner's text (a
	// float only reaches what follows it) and left in the page's own flow, uncontained; the blocks
	// that never wrap -- tables, code, figures and rules -- clear it through the page
	// stylesheet instead, and a bordered h1 forms its own block so its rule does not run under the
	// picture. Static CSS, no script: the no-script fallback only -- a reader with scripting off
	// still gets a sensible nearest-side float; the inlined planner (same owner as standalone)
	// replaces it when scripts run.
	for (const {image, paragraph, layout, owner} of assignments) {
		yield;
		const side = (layout.x ?? 0) < 50 ? 'left' : 'right';
		paragraph.style.cssText = 'float:' + side + ';max-width:100%;margin:0 ' + (side === 'left' ? '1rem 1rem 0' : '0 1rem 1rem');
		if (layout.y > 0) {
			paragraph.style.marginTop = layout.y + 'em';
			paragraph.style.setProperty('shape-outside', 'inset(' + layout.y + 'em 0 0)');
		}
		image.style.margin = '0';
		// The reserved box comes from the same rotated-bounds geometry every other consumer uses
		// (layout/browser.js, layout/interchange.js's `geometry.rotatedBoundsRad`, layout/model.mjs's
		// one owner), expressed as a percentage of the column the way the unrotated branch below already
		// is -- never the picture's own pixel dimensions, which have no relation to a requested
		// percentage width (a 4000px-wide source at width=40% would float 1788px wide in a 600px
		// column). Intrinsic width/height supply only the aspect ratio; a percentage padding-top/bottom
		// resolves against the same containing-block width CSS already resolves the float's own
		// percentage width against, so one basis serves both the box and its vertical reservation, and
		// the box stays exactly as wide as the column at every viewport width. The turned box is
		// centred, horizontally and vertically, in the reserved (wider, taller) box rather than
		// left-flush inside it, so the space this paragraph clears for it (the float's own width) is
		// evenly split around the picture on every side, not just above and below. A missing `width`
		// falls back to the picture's own natural pixel size in pixels, the same fallback the unrotated
		// branch below uses; without either width/height attribute the picture still turns, just without
		// the extra reservation (the same graceful narrowing Share already accepts elsewhere).
		const naturalWidth = Number(image.getAttribute('width')) || 0, naturalHeight = Number(image.getAttribute('height')) || 0;
		if (layout.rotate && naturalWidth > 0 && naturalHeight > 0) {
			const rad = layout.rotate * Math.PI / 180, aspect = naturalHeight / naturalWidth;
			// A steep turn (e.g. 90deg on a landscape source) can need the image WIDER than its own
			// reserved box's width -- the rotated bounding box is narrower than the picture's own
			// unrotated width whenever the turn swaps a wide dimension for a narrow one. Share's own
			// global `img{max-width:100%}` (a sensible default everywhere else) would silently clamp
			// exactly that case, shrinking the image and, with it, its auto height -- `max-width:none`
			// here overrides that single rule with a more specific one, only for a picture this pass
			// already sizes deliberately.
			image.style.maxWidth = 'none';
			if (layout.width != null) {
				let width = layout.width, height = width * aspect;
				let bounds = globalThis.RapierImageLayout.rotatedBoundsRad(width, height, rad);
				if (bounds.width > 100) {
					const scale = 100 / bounds.width;
					width *= scale;
					height *= scale;
					bounds = globalThis.RapierImageLayout.rotatedBoundsRad(width, height, rad);
				}
				paragraph.style.width = bounds.width + '%';
				paragraph.style.paddingTop = ((bounds.height - height) / 2) + '%';
				paragraph.style.paddingBottom = ((bounds.height - height) / 2) + '%';
				image.style.width = (width / bounds.width * 100) + '%';
				image.style.marginLeft = image.style.marginRight = (((bounds.width - width) / 2) / bounds.width * 100) + '%';
			} else {
				const bounds = globalThis.RapierImageLayout.rotatedBoundsRad(naturalWidth, naturalHeight, rad);
				paragraph.style.width = bounds.width + 'px';
				paragraph.style.paddingTop = ((bounds.height - naturalHeight) / 2) + 'px';
				paragraph.style.paddingBottom = ((bounds.height - naturalHeight) / 2) + 'px';
				image.style.width = naturalWidth + 'px';
				image.style.marginLeft = image.style.marginRight = ((bounds.width - naturalWidth) / 2) + 'px';
			}
		} else if (layout.lines != null) {
			// Sized in lines: the float shrinks to the picture, whose height is the lines (spec/md-layout.mjs imageStyle).
			image.style.width = 'auto';
			image.style.height = globalThis.RapierMarkdownLayout.linesHeightCss(layout.lines);
		} else {
			if (layout.width != null) paragraph.style.width = layout.width + '%';
			else if (image.getAttribute('width')) paragraph.style.width = image.getAttribute('width') + 'px';
			if (layout.width != null || image.getAttribute('width')) image.style.width = '100%';
		}
		if (layout.rotate) { image.style.transform = 'rotate(' + layout.rotate + 'deg)'; image.style.transformOrigin = '50% 50%'; }
		// `wrap=around` wraps to the picture's own alpha silhouette the way standard-adoption.md's
		// rung-2 paragraph promises -- `shape-outside:url(<the same picture>)`, which every engine that
		// reads shape-outside re-samples from the referenced image's own pixels, no script required. A
		// CSS transform does not turn the shape a `shape-outside` url() samples (it stays the picture's
		// unturned alpha), so a rotated `around` picture keeps the plain rectangular reservation above
		// instead -- an honest conservative box rather than a silhouette shaped for the wrong angle.
		// `layout.y` already owns `shape-outside` for its own inset reservation (below); the two are not
		// combinable (a float has exactly one `shape-outside` value), so a `y`-offset `around` picture
		// keeps that inset instead of silhouette wrapping -- a documented, narrow degradation.
		if (layout.wrap === 'around' && !layout.rotate && !layout.y) {
			const src = image.getAttribute('src');
			if (src) {
				paragraph.style.setProperty('shape-outside', 'url("' + src + '")');
				// Standard 10% alpha cutoff (`layout/model.mjs` alphaThreshold = .1).
				paragraph.style.setProperty('shape-image-threshold', '0.1');
			}
		}
		paragraph.classList.add('rapier-wrap-picture');
		owner.before(paragraph);
	}
	// `behind`/`front` position the picture exactly where `x`/`y`/`width` say, out of the words' flow
	// entirely (z-index below or above them) -- the absolutely positioned picture
	// standard-adoption.md's rung-2 paragraph promises for these two placements, no obstacle
	// avoidance, no script. The picture's own paragraph collapses to zero height in place (the same
	// collapse-in-place anchor layout/interchange.js's own reflow uses for every positioned kind) so
	// removing the picture from flow costs the surrounding text nothing.
	const positionedAssignments = [];
	for (const image of root.querySelectorAll('img[data-rapier-image-layout]')) {
		yield;
		const layout = globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
		if (layout?.wrap !== 'behind' && layout?.wrap !== 'front') continue;
		const paragraph = _rapierSharePictureParagraph(image);
		if (paragraph) positionedAssignments.push({image, paragraph, layout});
	}
	for (const {image, paragraph, layout} of positionedAssignments) {
		yield;
		paragraph.style.cssText = 'position:relative;height:0;margin:0;padding:0;line-height:0';
		const x = layout.x ?? 50, naturalWidth = Number(image.getAttribute('width')) || 0;
		if (layout.width != null) {
			image.style.width = layout.width + '%';
			image.style.left = (x - layout.width / 2) + '%';
		} else if (naturalWidth > 0) {
			image.style.width = naturalWidth + 'px';
			image.style.left = 'calc(' + x + '% - ' + (naturalWidth / 2) + 'px)';
		} else {
			image.style.left = x + '%';
		}
		image.style.position = 'absolute';
		image.style.top = (layout.y || 0) + 'em';
		image.style.margin = '0';
		if (layout.rotate) { image.style.transform = 'rotate(' + layout.rotate + 'deg)'; image.style.transformOrigin = '50% 50%'; }
		// Same rule as the live editor and the styled export: `behind` sinks under the owner's
		// own in-flow, non-positioned text; `front` keeps the default stack, already above it.
		if (layout.wrap === 'behind') image.style.zIndex = '-1';
		paragraph.classList.add('rapier-positioned-picture');
	}
	// A turned picture Share does not otherwise position (inline, which this static page does not
	// float at all) still turns -- the same picture, painted in place, never upright just because
	// Share's own float model has nothing else to say about it.
	const positioned = new Set([...assignments, ...positionedAssignments].map(row => row.image));
	for (const image of root.querySelectorAll('img[data-rapier-image-layout]')) {
		yield;
		if (positioned.has(image)) continue;
		const layout = globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
		if (!layout?.rotate) continue;
		image.style.transform = 'rotate(' + layout.rotate + 'deg)';
		image.style.transformOrigin = '50% 50%';
		const naturalWidth = Number(image.getAttribute('width')) || 0, naturalHeight = Number(image.getAttribute('height')) || 0;
		if (naturalWidth > 0 && naturalHeight > 0) {
			const rad = layout.rotate * Math.PI / 180;
			const boundWidth = naturalWidth * Math.abs(Math.cos(rad)) + naturalHeight * Math.abs(Math.sin(rad));
			const boundHeight = naturalWidth * Math.abs(Math.sin(rad)) + naturalHeight * Math.abs(Math.cos(rad));
			image.style.display = 'block';
			image.style.marginLeft = image.style.marginRight = ((boundWidth - naturalWidth) / 2) + 'px';
			image.style.marginTop = image.style.marginBottom = ((boundHeight - naturalHeight) / 2) + 'px';
		}
	}
}

function _rapierShareCapLongCodeBlocks(root) { return finish(_rapierShareCapLongCodeBlocksSteps(root)); }
function* _rapierShareCapLongCodeBlocksSteps(root) {
	for (const pre of root.querySelectorAll('pre')) { yield;
		const code = pre.querySelector(':scope > code') || pre;
		const text = String(code.textContent || '').replace(/\n$/, '');
		const lineCount = text === '' ? 0 : text.split('\n').length;
		if (lineCount <= RAPIER_SHARE_LONG_CODE_LINES) continue;
		pre.setAttribute('data-rapier-code-lines', String(lineCount));
		const note = document.createElement('span');
		note.className = 'rapier-code-lines-note';
		note.setAttribute('contenteditable', 'false');
		note.textContent = lineCount + ' lines';
		pre.appendChild(note);
	}
}

async function _rapierRequireOfflinePageImages(root) {
	const missing = [];
	const embedded = value => globalThis.RapierImageAssets.dataImage(String(value || '').trim());
	const requireResource = (value, label) => {
		const source = String(value || '').trim();
		if (!source || source.startsWith('#') || embedded(source)) return;
		missing.push(label + ': ' + (source.startsWith('data:') ? '(unsupported embedded resource)' : source));
	};
	for (const [index, image] of [...root.querySelectorAll('img,[data-rapier-remote-src]')].entries()) {
		const src = image.getAttribute('data-rapier-remote-src') ?? image.getAttribute('src') ?? '';
		if (embedded(src)) continue;
		const alt = image.getAttribute('data-rapier-remote-alt') ?? image.getAttribute('alt') ?? '';
		const destination = /^data:/i.test(src) ? '(unsupported embedded image)' : src || '(missing image source)';
		missing.push('Picture ' + (index + 1) + (alt ? ' — ' + alt : '') + ': ' + destination);
	}
	// A source candidate or an SVG/CSS picture is still an automatic resource. Inspect
	// the retained data; ordinary links remain navigation and local fragment references stay local.
	const sourceTags = new Set(['audio', 'video', 'source', 'track', 'input', 'iframe', 'embed', 'script']);
	const cssAttributes = new Set(['style', 'fill', 'stroke', 'filter', 'clip-path', 'mask', 'marker-start', 'marker-mid', 'marker-end', 'cursor', 'color-profile']);
	for (const element of root.querySelectorAll('*')) {
		const tag = String(element.localName || element.tagName || '').toLowerCase();
		if (sourceTags.has(tag)) requireResource(element.getAttribute('src'), tag + ' source');
		for (const attribute of ['poster', 'background']) requireResource(element.getAttribute(attribute), tag + ' ' + attribute);
		if (tag === 'object') requireResource(element.getAttribute('data'), 'object source');
		if (tag === 'link' || element.namespaceURI === 'http://www.w3.org/2000/svg' && tag !== 'a')
			for (const attribute of ['href', 'xlink:href']) requireResource(element.getAttribute(attribute), tag + ' ' + attribute);
		if (tag === 'img' || tag === 'source') for (const source of _rapierSrcsetUrls(element.getAttribute('srcset') || ''))
			requireResource(source, tag + ' source candidate');
		for (const attribute of element.attributes || []) if (cssAttributes.has(attribute.name.toLowerCase())) {
			const urls = _rapierCssValueUrls(attribute.value);
			if (urls === null) missing.push(tag + ' ' + attribute.name + ': (unresolved CSS resource)');
			else for (const url of urls) requireResource(url, tag + ' ' + attribute.name);
		}
	}
	if (!missing.length) return;
	// An acknowledged, scrollable sheet, not a disappearing toast or a partial-file opt-in.
	// Both Close and Cancel below refuse; neither can authorize a page with missing pictures.
	if (typeof rapierConfirm === 'function') await rapierConfirm({
		title: 'pictures not included',
		message: 'No web page was written. Embed these pictures before exporting or sharing an offline page. '
			+ 'Your document is unchanged. ' + missing.join('; '),
		confirmLabel: 'close',
	});
	throw Object.assign(new Error('Web page not written; embed the listed pictures and try again'), {code: 'EXPORT_IMAGE_UNAVAILABLE'});
}

function _rapierSrcsetUrls(value) {
	const urls = [];
	let at = 0;
	while (at < value.length) {
		while (at < value.length && /[\t\n\f\r ,]/.test(value[at])) at++;
		const start = at;
		while (at < value.length && !/[\t\n\f\r ]/.test(value[at])) at++;
		const source = value.slice(start, at);
		if (!source) break;
		// A data URL's comma belongs to its URL. Only trailing separators or the
		// comma after a descriptor finish a candidate.
		if (source.endsWith(',')) { urls.push(source.replace(/,+$/, '')); continue; }
		urls.push(source);
		let parentheses = 0;
		while (at < value.length) {
			const char = value[at++];
			if (char === '(') parentheses++;
			else if (char === ')' && parentheses) parentheses--;
			else if (char === ',' && !parentheses) break;
		}
	}
	return urls;
}

// Shared by live CSS admission and offline resource admission. Quoted strings are
// resource URLs only inside url() or as an image-set option, never arbitrary CSS text.
function _rapierCssValueUrls(value) {
	const urls = [], functions = [];
	let at = 0;
	const space = char => char !== undefined && /[\t\n\f\r ]/.test(char);
	const escape = () => {
		at++;
		if (value[at] === '\r' || value[at] === '\n' || value[at] === '\f') {
			if (value[at++] === '\r' && value[at] === '\n') at++;
			return '';
		}
		const hex = /^[\da-f]{1,6}/i.exec(value.slice(at));
		if (!hex) return value[at++] || '';
		at += hex[0].length;
		if (space(value[at]) && value[at++] === '\r' && value[at] === '\n') at++;
		const code = parseInt(hex[0], 16);
		return String.fromCodePoint(!code || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff ? 0xfffd : code);
	};
	const string = () => {
		const quote = value[at++];
		let text = '';
		while (at < value.length) {
			if (value[at] === quote) { at++; return text; }
			if (/[\r\n\f]/.test(value[at])) return null;
			text += value[at] === '\\' ? escape() : value[at++];
		}
		return null;
	};
	const whitespace = () => {
		for (;;) {
			while (space(value[at])) at++;
			if (value.slice(at, at + 2) !== '/*') return;
			const end = value.indexOf('*/', at + 2);
			at = end < 0 ? value.length : end + 2;
		}
	};
	while (at < value.length) {
		whitespace();
		if (at >= value.length) break;
		const parent = functions.at(-1), char = value[at];
		if (char === '"' || char === "'") {
			const text = string();
			if (parent?.imageSet && parent.option) {
				if (text === null) return null;
				urls.push(text);
				parent.option = false;
			}
			continue;
		}
		if (char === ',') { if (parent?.imageSet) parent.option = true; at++; continue; }
		if (char === ')') { functions.pop(); at++; continue; }
		if (parent?.imageSet) parent.option = false;
		if (/[-\w\u0080-\uffff\\]/.test(char)) {
			let name = '';
			while (at < value.length && /[-\w\u0080-\uffff\\]/.test(value[at]))
				name += value[at] === '\\' ? escape() : value[at++];
			if (value[at] !== '(') continue;
			at++;
			name = name.toLowerCase();
			if (name !== 'url') { functions.push({imageSet: name === 'image-set' || name === '-webkit-image-set', option: true}); continue; }
			while (space(value[at])) at++;
			let url = '';
			if (value[at] === '"' || value[at] === "'") { url = string(); whitespace(); }
			else while (at < value.length && value[at] !== ')') url += value[at] === '\\' ? escape() : value[at++];
			if (url === null || value[at++] !== ')') return null;
			urls.push(url.trim());
			continue;
		}
		if (char === '(') functions.push({imageSet: false});
		at++;
	}
	return urls;
}

async function _rapierBuildSharedPage(captured) {
	const context = await _rapierPrepareInterchangeContext({kind: 'share'}, captured);
	// One owner for every HTML file Rapier writes, including offline-image admission and CSP.
	// Share adds only the nearest-side no-script float and the long-code treatment.
	const artifact = await _rapierBuildArtifact({
		kind: 'standalone',
		extraCss: _rapierSharedPageFallbackCss(),
		async afterRoot(root) {
			/* Unlike TXT/DOCX (which route through _rapierProjectPortableRoot and have no
				 native disclosure widget to fall back on), the shared page is a real HTML
				 document a real browser renders — the same styled root the standalone HTML
				 export already leaves untouched (_rapierBuildArtifact never flattens
				 details for kind:'standalone'). <details>/<summary> pass the 'export'
				 sanitize profile unchanged (only <form> is forbidden), so flattening here
				 only threw away a native, JS-free expand/collapse the architecture's own
				 fidelity table promises ("Complete shared/styled HTML: Exact recoverable
				 source"). Leave it as authored, exactly like standalone HTML export. */
			if (context.work) {
				await finishAsync(_rapierSharedPageLayoutSteps(root), context.work);
				await finishAsync(_rapierShareCapLongCodeBlocksSteps(root), context.work);
			} else { _rapierSharedPageLayout(root); _rapierShareCapLongCodeBlocks(root); }
		},
	}, context);
	// No cap and no warning: the page is as large as the document is. A page over the editor's own 25
	// MiB open limit still opens in any browser.
	const blob = new Blob([artifact.html], {type: 'text/html;charset=utf-8'});
	return {blob, filename: context.baseName + '.html'};
}

const _RAPIER_SHARED_SOURCE_TYPE = 'text/markdown';

const _RAPIER_SHARED_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/;

const _RAPIER_SHARED_DEFINITION = /^(?:[A-Za-z0-9\-_.!~*'()]|%[0-9A-Fa-f]{2})+$/;

const _rapierSharedEncode = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/#/g, '&#35;').replace(/\r/g, '&#13;');

function* _rapierSharedEncodeSteps(text) {
	const parts = [];
	for (let at = 0; at < text.length; at += 16384) { parts.push(_rapierSharedEncode(text.slice(at, at + 16384))); yield; }
	return parts.join('');
}

const _rapierSharedDecode = text => text.replace(/&#35;/g, '#').replace(/&#13;/g, '\r').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

const RAPIER_SHARE_LONG_CODE_LINES = 40;

function _rapierImageSources(tokens) {
  const sources = new Set();
  const visit = tokens => {
    for (const token of tokens || []) {
      if (token.type === 'image') sources.add(token.attrGet('src') || '');
      else if (token.children) visit(token.children);
    }
  };
  visit(tokens);
  return sources;
}

async function _rapierDataImageDestinationsAsync(source, work) {
	if (!source.includes('![')) return [];
	return runtime.dataImageDestinationsAsync ? runtime.dataImageDestinationsAsync(source, work)
		: _rapierImageDestinations(source, url => !!globalThis.RapierImageAssets.dataImage(url));
}

function _rapierImageDestinations(source, accepts) {
  // Only a rendered Markdown image consumes a definition; unused definitions stay literal source.
  if (!source.includes('![')) return [];
  const env = {}, tokens = md.parse(source, env), offsets = _rapierLineStartOffsets(source);
  const hrefs = _rapierImageSources(tokens), labels = new Set(), destinations = [], seen = new Set();
  const visit = rows => { for (const token of rows || []) {
    if (token.type === 'image' && token.meta?.mdImage?.reference) labels.add(token.meta.mdImage.reference);
    else if (token.children) visit(token.children);
  }};
  visit(tokens);
  const destinationAt = (start, stop, expected = null, extra = {}) => {
    const parsed = md.helpers.parseLinkDestination(source, start, stop);
    if (!parsed?.ok || parsed.pos <= start || parsed.pos > stop) return false;
    const destination = md.normalizeLink(parsed.str);
    if (expected !== null && destination !== expected || !hrefs.has(destination) || !accepts(destination)) return false;
    const outerStart = start;
    let end = parsed.pos, outerEnd = end, delimited = false;
    if (source[start] === '<' && source[end - 1] === '>') { start++; end--; delimited = true; }
    const key = start + ':' + end;
    if (!seen.has(key)) { seen.add(key); destinations.push({start, end, outerStart, outerEnd, delimited, destination, source: source.slice(start, end), ...extra}); }
    return true;
  };
  for (const image of _rapierScanMarkdownImages(source, tokens)) {
    if (image.kind !== 'inline') continue;
    let start = image.innerStart;
    while (start < image.innerEnd && /[ \t\r\n]/.test(source[start])) start++;
    destinationAt(start, image.innerEnd, null, {image});
  }
  const definitions = new Set();
  for (const token of tokens) {
    if (token.type !== 'reference_definition' || !token.map) continue;
    const label = token.meta?.label;
    if (!label || definitions.has(label)) continue;
    definitions.add(label);
    const destination = env.references?.[label]?.href;
    if (!labels.has(label) || !hrefs.has(destination) || !accepts(destination)) continue;
    const span = _rapierSourceLineSpan(source, offsets, token.map[0], token.map[1]);
    let found = false;
    for (let open = source.indexOf('[', span.start); open >= 0 && open < span.end; open = source.indexOf('[', open + 1)) {
      if (_rapierSourceCharEscaped(source, open)) continue;
      let close = open + 1;
      while (close < span.end && (source[close] !== ']' || _rapierSourceCharEscaped(source, close))) close++;
      if (source[close + 1] !== ':') continue;
      const rawLabel = source.slice(open + 1, close);
      const normalized = md.utils.normalizeReference(rawLabel);
      const unquoted = md.utils.normalizeReference(rawLabel.replace(/\r?\n[ \t]*(?:>[ \t]*)+/g, ' '));
      if (normalized !== label && unquoted !== label) continue;
      let start = close + 2;
      while (start < span.end) {
        if (/[ \t\r\n]/.test(source[start])) start++;
        else if (token.level > 0 && source[start] === '>') start++;
        else break;
      }
      if (destinationAt(start, span.end, destination, {reference: label, title: env.references[label].title || ''})) { found = true; break; }
    }
    if (!found) throw new Error('An image reference destination cannot be changed without altering its source');
  }
  return destinations.sort((left, right) => left.start - right.start);
}

function _rapierScanMarkdownImages(raw, parsedTokens = null) {
	const source = String(raw || '');
	const found = [];

	if (source.indexOf('![') < 0) return found;
	const max = source.length;
	const starts = _rapierLineStartOffsets(source);
	const tokens = parsedTokens || (md ? md.parse(source, _rapierMarkdownEnvironment()) : []);
	const rendered = [];
	const visit = rows => { for (const token of rows || []) {
		if (token.type === 'image') rendered.push(token);
		else if (token.children) visit(token.children);
	} };
	visit(tokens);
	const protectedRanges = tokens.filter(token => token.map &&
		['fence','code_block','html_block'].includes(token.type)).map(token =>
		({start:starts[token.map[0]],end:starts[token.map[1]] ?? max}));
	let protectedIndex = 0;
	for (let start = 0; start < max - 3; start++) {
		while (protectedRanges[protectedIndex]?.end <= start) protectedIndex++;
		const protectedRange = protectedRanges[protectedIndex];
		if (protectedRange && start >= protectedRange.start) { start = protectedRange.end-1; continue; }
		if (source[start] === '`' && !_rapierSourceCharEscaped(source,start)) {
			let width = 1;
			while (source[start+width] === '`') width++;
			let at = start+width, close = -1;
			while ((at = source.indexOf('`',at)) >= 0) {
				let count = 1; while (source[at+count] === '`') count++;
				if (count === width) { close = at+count; break; }
				at += count;
			}
			if (close >= 0) { start = close-1; continue; }
			start += width-1; continue;
		}
		if (source[start] === '<') {
			const html = /^(?:<!--[\s\S]*?-->|<\/?[A-Za-z](?:"[^"]*"|'[^']*'|[^'"<>])*?>)/.exec(source.slice(start));
			if (html) { start += html[0].length-1; continue; }
		}
		if (source.charCodeAt(start) !== 0x21 || source.charCodeAt(start + 1) !== 0x5b ||
				_rapierSourceCharEscaped(source, start)) continue;
		let cursor = start + 2;
		let bracketDepth = 1;
		for (; cursor < max; cursor++) {
			if (_rapierSourceCharEscaped(source, cursor)) continue;
			const code = source.charCodeAt(cursor);
			if (code === 0x5b) bracketDepth++;
			else if (code === 0x5d && --bracketDepth === 0) break;
		}
		if (bracketDepth !== 0) continue;
		const altStart = start + 2;
		const altEnd = cursor;
		const next = source.charAt(cursor + 1);
		if (next === '(') {
			const parenStart = cursor + 1;
			cursor = parenStart + 1;
			let parenDepth = 1;
			let quote = '';
			let angle = false;
			for (; cursor < max; cursor++) {
				if (_rapierSourceCharEscaped(source, cursor)) continue;
				const char = source.charAt(cursor);
				if (angle) {
					if (char === '>') angle = false;
					continue;
				}
				if (quote) {
					if (char === quote) quote = '';
					continue;
				}
				if (char === '<' && parenDepth === 1) { angle = true; continue; }
				if ((char === '"' || char === "'") && parenDepth === 1) { quote = char; continue; }
				if (char === '(') { parenDepth++; continue; }
				if (char === ')' && --parenDepth === 0) break;
			}
			if (parenDepth !== 0) continue;
			const end = cursor + 1;
			const innerStart = parenStart + 1;
			const innerEnd = cursor;
			const destination = _rapierParseMarkdownImageDestination(source.slice(innerStart, innerEnd));
			found.push({
				kind: 'inline', start, end, altStart, altEnd, parenStart, innerStart, innerEnd,
				altSource: source.slice(altStart, altEnd),
				destinationSource: destination.destination,
				titleSource: destination.title,
				referenceSource: '',
				source: source.slice(start, end),
			});
			start = end - 1;
			continue;
		}
		if (next === '[') {
			let refEnd = cursor + 2;
			for (; refEnd < max; refEnd++) {
				if (_rapierSourceCharEscaped(source, refEnd)) continue;
				if (source.charAt(refEnd) === ']') break;
			}
			if (refEnd >= max) continue;
			const end = refEnd + 1;
			found.push({
				kind: 'reference', start, end, altStart, altEnd,
				altSource: source.slice(altStart, altEnd),
				destinationSource: '', titleSource: '',
				referenceSource: source.slice(cursor + 1, end),
				source: source.slice(start, end),
			});
			start = end - 1;
		} else {
			const end = cursor + 1;
			found.push({kind: 'reference', start, end, altStart, altEnd, altSource: source.slice(altStart, altEnd),
				destinationSource: '', titleSource: '', referenceSource: '', source: source.slice(start, end)});
			start = end - 1;
		}
	}
	let consumed = 0;
	const openRunsList = _rapierImageOpenRunsList(tokens);
	const accepted = found.filter(image => {
		const text = image.source.replace(/\r\n?/g, '\n');
		const index = rendered.findIndex((token, at) => at >= consumed && text === token.meta?.mdImage?.source);
		if (index < 0) return false;
		const token = rendered[index]; image.renderIndex = index; consumed = index + 1; image.reference = token.meta.mdImage.reference; image.destination = token.attrGet('src');
		image.title = token.attrGet('title') || '';
		image.openRuns = openRunsList[index] || [];
		return true;
	});
	const targets = source.includes('<!--md-layout:') && md
		? globalThis.RapierMarkdownLayout.layoutTargets(source, md, _rapierMarkdownEnvironment()) : [];
	for (const image of accepted) {
		image.tokenEnd = image.end;
		const target = targets.find(row => row.imageOnly && row.marker && !row.reason &&
			row.start <= image.start && row.end >= image.end &&
			row.marker.start >= image.end && !source.slice(image.end, row.marker.start).trim());
		if (!target) continue;
		image.placement = target.layout;
		image.layoutStart = target.marker.start;
		image.placementSource = source.slice(image.tokenEnd, target.marker.end);
		image.end = target.marker.end;
		image.source = source.slice(image.start, image.end);
	}
	return accepted;
}

function _rapierParseMarkdownImageDestination(inner) {
	const source = String(inner || '');
	let start = 0;
	while (start < source.length && /\s/.test(source.charAt(start))) start++;
	if (source.charAt(start) === '<') {
		let end = start + 1;
		while (end < source.length && (source.charAt(end) !== '>' || _rapierSourceCharEscaped(source, end))) end++;
		if (end < source.length) {
			return {
				destination: source.slice(start, end + 1),
				title: source.slice(end + 1).trim(),
			};
		}
	}
	let depth = 0;
	let cursor = start;
	for (; cursor < source.length; cursor++) {
		if (_rapierSourceCharEscaped(source, cursor)) continue;
		const char = source.charAt(cursor);
		if (char === '(') depth++;
		else if (char === ')' && depth > 0) depth--;
		else if (/\s/.test(char) && depth === 0) break;
	}
	return {
		destination: source.slice(start, cursor),
		title: source.slice(cursor).trim(),
	};
}

function _rapierImageOpenRunsList(tokens) {
	const list = [];
	for (const block of tokens) {
		if (block.type !== 'inline' || !Array.isArray(block.children)) continue;
		const stack = [];
		for (const token of block.children) {
			if (token.type === 'image') { list.push(stack.slice()); continue; }
			if (token.type === 'rapier_color_open') {
				const hex = token.attrGet('data-md-color');
				stack.push({open: _rapierFormatColorOpen(hex), close: RAPIER_COLOR_CLOSE});
				continue;
			}
			if (token.type === 'rapier_color_close') { stack.pop(); continue; }
			if (token.type === 'strong_open' || token.type === 'em_open' || token.type === 's_open') {
				stack.push({open: token.markup, close: token.markup});
				continue;
			}
			if (token.type === 'strong_close' || token.type === 'em_close' || token.type === 's_close') stack.pop();
		}
	}
	return list;
}

function _rapierArtifactFactoryModules(dependencies, group) {
  const paths = dependencies.groups && dependencies.groups[group] ? dependencies.groups[group] : Object.keys(dependencies.factories);
  return paths.map(path => 'modules[' + JSON.stringify(path) + '] = (' + Function.prototype.toString.call(dependencies.factories[path]) + ')();').join('\n');
}

function _rapierProjectArtifactLayout(root, metadata, geometry, pretext) {
  if (!root || !metadata || !geometry || !pretext) return null;
  const doc = root.ownerDocument, view = doc.defaultView;
  const styles = new Map(), originals = new Map(), spacers = [], floats = [], steps = [], profiles = new WeakMap();
  const css = node => view.getComputedStyle(node);
  const box = node => node.getBoundingClientRect();
  const pixels = value => (Number.isFinite(value) ? Math.round(value * 100) / 100 : 0) + 'px';
  let scheduled = 0, busy = false, stopped = false, printing = false, lastWidth = -1;

  function style(node, values) {
    if (!styles.has(node)) styles.set(node, node.getAttribute('style'));
    for (const [key, value] of Object.entries(values)) node.style.setProperty(key, value);
  }

  function restore() {
    for (const [paragraph, nodes] of originals) paragraph.replaceChildren(...nodes);
    originals.clear();
    for (const [node, value] of styles) {
      if (value === null) node.removeAttribute('style');
      else node.setAttribute('style', value);
    }
    styles.clear();
    for (const spacer of spacers) spacer.remove();
    spacers.length = 0;
    for (const float of floats) float.remove();
    floats.length = 0;
    for (const item of steps) item.removeAttribute('data-rapier-wrap-step');
    steps.length = 0;
  }

  // Plain inline text uses Pretext. Complex blocks keep their original controls through floats.
  function prepare(paragraph) {
    if (!/^(P|H[1-6])$/.test(paragraph.tagName) || !paragraph.textContent.trim() || paragraph.textContent.length > 8192 ||
        paragraph.querySelector('img,svg,math,br,input,button,iframe,canvas,.math-rendered')) return null;
    const computed = css(paragraph);
    if (computed.textAlign === 'justify' || computed.writingMode !== 'horizontal-tb' ||
        computed.textTransform !== 'none' || computed.whiteSpace !== 'normal' || computed.transform !== 'none' ||
        // Lines start at the padding box's top-left: left, right or top inset is refused.
        ['paddingLeft', 'paddingRight', 'paddingTop', 'borderLeftWidth', 'borderRightWidth', 'borderTopWidth']
          .some(key => parseFloat(computed[key]) > 0)) return null;
    const runs = [], items = [], walker = doc.createTreeWalker(paragraph, 4);
    for (let node; (node = walker.nextNode());) {
      if (runs.length === 192) return null;
      const parents = [];
      for (let parent = node.parentElement; parent !== paragraph; parent = parent.parentElement) {
        if (!parent || !/^(A|SPAN|EM|I|STRONG|B|DEL|S|MARK|CODE|U|INS|ABBR|SUP|SUB)$/.test(parent.tagName)) return null;
        parents.unshift(parent);
      }
      const computedRun = css(node.parentElement);
      if (computedRun.textTransform !== 'none' || computedRun.writingMode !== 'horizontal-tb') return null;
      const font = `${computedRun.fontStyle} ${computedRun.fontWeight} ${computedRun.fontSize} ${computedRun.fontFamily}`;
      const letterSpacing = parseFloat(computedRun.letterSpacing) || 0;
      const prepared = geometry.prepareRun(node.data, font, letterSpacing);
      if (!prepared) return null;
      // A chip's box is repeated by each piece of it, and it breaks as the browser breaks inline code, as the editor's projection does.
      const boxed = parents.some(parent => parent.tagName === 'CODE');
      const extraWidth = boxed ? ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth', 'marginLeft', 'marginRight']
        .reduce((width, key) => width + (parseFloat(computedRun[key]) || 0), 0) : 0;
      runs.push({parents, prepared, directions: parents.map(parent => parent.getAttribute('dir') === 'auto' ? css(parent).direction : null)});
      items.push({text: prepared.raw, font, letterSpacing, break: 'normal', extraWidth});
    }
    if (!runs.length) return null;
    const fontSize = parseFloat(computed.fontSize) || 16;
    return {paragraph, runs, flow: pretext.prepareRichInline(items), direction: computed.direction,
      align: computed.textAlign, fontSize, lineHeight: parseFloat(computed.lineHeight) || fontSize * 1.65,
      balance: computed.textWrapStyle === 'balance' ? fontSize : 0};
  }

  // An id survives on the first fragment only.
  const idsKept = new WeakSet();
  function fragmentNode(record, fragment) {
    const run = record.runs[fragment.itemIndex], mapped = geometry.mapFragment(run?.prepared, fragment);
    if (!mapped) return null;
    // A line ends on the white space it broke at. A chip, a link or a highlight must not paint that space, so it stands after the shell.
    const kept = run.parents.length ? mapped.text.replace(/[ \t\n\r\f]+$/, '') : mapped.text;
    const split = kept && kept.length < mapped.text.length;
    let child = doc.createTextNode(split ? kept : mapped.text);
    for (let index = run.parents.length - 1; index >= 0; index--) {
      const shell = run.parents[index].cloneNode(false);
      if (shell.id) { if (idsKept.has(run.parents[index])) shell.removeAttribute('id'); else idsKept.add(run.parents[index]); }
      if (run.directions[index]) shell.setAttribute('dir', run.directions[index]);
      shell.append(child); child = shell;
    }
    if (!split) return child;
    const pair = doc.createDocumentFragment();
    pair.append(child, doc.createTextNode(mapped.text.slice(kept.length)));
    return pair;
  }

  function project(record, width, top, obstacles) {
    const plan = geometry.flowLines(record.flow, width, top, obstacles, record.lineHeight,
      metadata.wrapColumnFloor(record.fontSize), record.direction, record.balance, record.align);
    if (!plan) return false;
    const output = doc.createDocumentFragment();
    let previous = null;
    for (const line of plan.lines) {
      const element = doc.createElement('span');
      element.style.cssText = `display:block;position:absolute;left:${pixels(line.x)};top:${pixels(line.y)};width:${pixels(line.width)};height:${pixels(record.lineHeight)};white-space:pre;direction:${record.direction}`;
      element.style.textAlign = ['left', 'center', 'right', 'start', 'end'].includes(record.align)
        ? record.align : record.direction === 'rtl' ? 'right' : 'left';
      for (const fragment of line.fragments) {
        const child = fragmentNode(record, fragment);
        if (!child) return false;
        if (hasGap(record, previous, fragment)) {
          const gap = doc.createElement('span');
          gap.style.cssText = 'display:inline-block;width:' + pixels(fragment.gapBefore);
          gap.textContent = ' '; element.append(gap);
        }
        element.append(child); previous = fragment;
      }
      output.append(element);
    }
    originals.set(record.paragraph, [...record.paragraph.childNodes]);
    record.paragraph.replaceChildren(output);
    style(record.paragraph, {position: 'relative', height: pixels(plan.height), 'min-height': '0'});
    return true;
  }

  function hasGap(record, previous, current) {
    if (!previous) return false;
    let found = false;
    for (let index = previous.itemIndex; index <= current.itemIndex; index++) {
      const run = record.runs[index].prepared;
      const start = index === previous.itemIndex ? geometry.cursorOffset(run, previous.end) : 0;
      const end = index === current.itemIndex ? geometry.cursorOffset(run, current.start) : run.raw.length;
      if (start == null || end == null || end < start) return false;
      const gap = run.raw.slice(start, end);
      if (gap && !/^[ \t\n\r\f]+$/.test(gap)) return false;
      found ||= !!gap;
    }
    return found;
  }

  // wrap=around reads data-rapier-occupancy, else alpha. Cache key: src, dimensions, layout.wrap, rotate angle.
  // A turned raster's profile is recomputed here as pictureProfile does, never shipped.
  function profile(image, layout) {
    const src = image.currentSrc || image.getAttribute('src') || '', rotateRad = (layout.rotate || 0) * Math.PI / 180;
    const cached = profiles.get(image);
    if (cached?.src === src && cached.width === image.naturalWidth && cached.height === image.naturalHeight &&
        cached.wrap === layout.wrap && cached.angle === rotateRad) return cached.profile;
    let value;
    if (layout.wrap === 'box') {
      value = boxProfile(image);
      if (!value && rotateRad) value = geometry.rasterTiltProfile(image.naturalWidth, image.naturalHeight, rotateRad);
    } else {
      const occupancy = typeof geometry.parseProfile === 'function' && geometry.parseProfile(image.getAttribute('data-rapier-occupancy'));
      value = occupancy || geometry.alphaProfile(image);
      if (!occupancy && rotateRad && value) value = geometry.rotatedRasterAlpha(value, image.naturalWidth, image.naturalHeight, rotateRad) || value;
    }
    profiles.set(image, {src, width: image.naturalWidth, height: image.naturalHeight, wrap: layout.wrap, angle: rotateRad, profile: value});
    return value;
  }

  // wrap=box reads data-rapier-box-polygon; this page never parses a recipe or bundles Draw. No polygon: whole rectangle.
  function boxProfile(image) {
    const raw = image.getAttribute('data-rapier-box-polygon');
    if (!raw) return null;
    const numbers = raw.trim().split(/\s+/).map(Number);
    if (numbers.length < 6 || numbers.length % 2 || numbers.some(value => !Number.isFinite(value))) return null;
    const corners = [];
    for (let index = 0; index < numbers.length; index += 2) corners.push([numbers[index], numbers[index + 1]]);
    return geometry.polygonProfile(corners);
  }

  // As the live editor (browser.js).
  function syncInlineRotatedPictures(exclude) {
    for (const image of root.querySelectorAll('img[data-rapier-image-layout]')) {
      if (exclude.has(image) || !image.complete || !image.naturalWidth || !image.naturalHeight) continue;
      const layout = metadata.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
      if (!layout?.rotate || ['around', 'box', 'behind', 'front'].includes(layout.wrap)) continue;
      const width = image.offsetWidth, height = image.offsetHeight;
      if (!(width > 0 && height > 0)) continue;
      const paragraph = image.closest('p');
      // geometry.imageOnly (layout/model.mjs).
      const alone = !!paragraph && imageOnly(paragraph, image);
      const baseLeft = parseFloat(css(image).marginLeft) || 0;
      const rotated = geometry.rotatedBoundsRad(width, height, layout.rotate * Math.PI / 180);
      const dx = (rotated.width - width) / 2, dy = (rotated.height - height) / 2;
      const values = {transform: `rotate(${layout.rotate}deg)`, 'transform-origin': '50% 50%',
        'margin-left': pixels(baseLeft + dx), 'margin-right': pixels(dx)};
      if (alone) { values.display = 'block'; values['margin-top'] = pixels(dy); values['margin-bottom'] = pixels(dy); }
      style(image, values);
    }
  }

  // A block that cannot wrap stands with its box just below the outline, as in the editor. Its own margin moves it, so
  // nothing is inserted between a picture and its words (a reader and the witnesses read nextElementSibling).
  function clearTo(element, bottom, origin) {
    for (let pass = 0; pass < 3; pass++) {
      const distance = bottom - (box(element).top - origin);
      if (Math.abs(distance) <= 0.5) return;
      style(element, {'margin-top': pixels(Math.max(0, (parseFloat(css(element).marginTop) || 0) + distance))});
    }
  }

  const imageOnly = geometry.imageOnly;

  function neighbourKind(element) {
    if (metadata.wrapTextBlock(element)) return 'prose';
    const image = element.tagName === 'P' ? element.querySelector('img') : null;
    if (image && imageOnly(element, image)) return 'picture';
    // An empty paragraph is transparent to the owner search, as in the editor.
    if (element.tagName === 'P' && !element.textContent.trim() && !image) return 'metadata';
    return null;
  }

  // Float fallback as the editor's floatAround.
  const FLOAT_BLOCK = /^(P|H[1-6]|UL|OL|BLOCKQUOTE|DETAILS|SUMMARY|DL)$/;
  function floatAround(element, width, height, top, obstacles) {
    // As the editor: a paragraph or heading floats whatever it holds; a list, quote or disclosure holding a rigid block does not.
    if (!FLOAT_BLOCK.test(element.tagName) || !/^(P|H[1-6])$/.test(element.tagName) && element.querySelector('table, pre, figure, img, .math-rendered')) return false;
    // As the editor: a disclosure's box ends where the outline begins (layout/model.mjs boxClearance).
    if (element.tagName === 'DETAILS') {
      const computed = css(element), outer = box(element), floor = metadata.wrapColumnFloor(parseFloat(computed.fontSize) || 16);
      const offset = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.borderLeftWidth) || 0);
      const own = obstacles.map(obstacle => ({...obstacle, x: obstacle.x + offset}));
      const marginLeft = parseFloat(computed.marginLeft) || 0, marginRight = parseFloat(computed.marginRight) || 0;
      let extent = height, clear = null;
      for (let pass = 0; pass < 3; pass++) {
        const next = geometry.boxClearance(own, outer.width, top, extent, floor);
        if (!next) break;
        if (!next.fits) return false;
        clear = {left: Math.max(clear?.left || 0, next.left), right: Math.max(clear?.right || 0, next.right)};
        style(element, {'margin-left': pixels(marginLeft + clear.left), 'margin-right': pixels(marginRight + clear.right)});
        const grown = box(element).height;
        if (Math.abs(grown - extent) < .5) break;
        extent = grown;
      }
      if (clear) return true;
    }
    if (element.tagName === 'DETAILS' && !element.open) {
      const summary = element.querySelector(':scope > summary');
      if (!summary) return false;
      const bounds = box(summary), outer = box(element), computed = css(summary);
      const inset = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.borderLeftWidth) || 0);
      const parentInset = (parseFloat(css(element).paddingLeft) || 0) + (parseFloat(css(element).borderLeftWidth) || 0);
      const contentWidth = bounds.width - inset - (parseFloat(computed.paddingRight) || 0) - (parseFloat(computed.borderRightWidth) || 0);
      return floatAround(summary, contentWidth, bounds.height, top + bounds.top - outer.top,
        obstacles.map(obstacle => ({...obstacle, x: obstacle.x - bounds.left - inset + outer.left + parentInset})));
    }
    const computed = css(element);
    const inset = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.borderTopWidth) || 0);
    top += inset;
    const bottom = top + height;
    const inside = obstacles.filter(obstacle => obstacle.y < bottom + 4096 && obstacle.y + obstacle.height > top &&
      obstacle.x < width && obstacle.x + obstacle.width > 0);
    if (!inside.length) return false;
    // layout/model.mjs wrapShape; `geometry` is modules["layout/model.mjs"]. As the editor, the start side reaches from
    // the box's own start edge.
    const start = computed.direction === 'rtl' ? 'right' : 'left';
    const startInset = start === 'left' ? (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.borderLeftWidth) || 0)
      : -((parseFloat(computed.paddingRight) || 0) + (parseFloat(computed.borderRightWidth) || 0));
    const shapeFor = side => {
      const shape = geometry.wrapShape(side, side !== start ? inside : inside.map(obstacle => ({...obstacle, x: obstacle.x + startInset})), width, top);
      if (!shape) return null;
      return {...shape, shape: 'polygon(' + shape.points.map(point => pixels(point[0]) + ' ' + pixels(point[1])).join(',') + ') border-box'};
    };
    const shapes = {left: shapeFor('left'), right: shapeFor('right')};
    const spent = (shapes.left?.boxWidth || 0) + (shapes.right?.boxWidth || 0);
    if (!spent || spent > width - metadata.wrapColumnFloor(parseFloat(css(element).fontSize) || 16)) return false;
    const before = geometry.edgeLines(element), placed = [];
    for (const side of ['left', 'right']) {
      const shape = shapes[side];
      if (!shape) continue;
      const float = doc.createElement('span');
      float.setAttribute('aria-hidden', 'true');
      float.style.cssText = `float:${side};width:${pixels(shape.boxWidth)};height:${pixels(shape.boxHeight)};margin-top:${pixels(shape.startY)};shape-outside:${shape.shape};pointer-events:none`;
      element.prepend(float); floats.push(float); placed.push([float, shape]);
    }
    // As the editor: each float ends at the block's own content bottom and the block keeps its own display, so its
    // margins collapse as they do with no picture. A float the content does not reach goes.
    const contentBottom = () => {
      let first = element.firstChild;
      while (first && placed.some(([float]) => float === first)) first = first.nextSibling;
      if (!first || !element.lastChild) return box(element).height - inset;
      const range = doc.createRange(); range.setStartBefore(first); range.setEndAfter(element.lastChild);
      return range.getBoundingClientRect().bottom - box(element).top - inset;
    };
    for (let pass = 0; pass < 4; pass++) {
      const content = contentBottom();
      let changed = false;
      for (const [float, shape] of [...placed]) {
        const bounded = Math.min(shape.boxHeight, content - shape.startY);
        if (bounded <= 0) { float.remove(); placed.splice(placed.findIndex(([value]) => value === float), 1); changed = true; }
        else if (Math.abs((parseFloat(float.style.height) || 0) - bounded) > 0.5) { float.style.height = pixels(bounded); changed = true; }
      }
      if (!changed) break;
    }
    // As the editor: a list item's marker and a quote's bar move with the words the floats moved.
    const {markers, bars, steps: breaks} = geometry.edgeMarks(element, before);
    for (const {item, shift} of markers) style(item, {'--md-marker': 'calc(' + (item.style.getPropertyValue('--md-marker') || '0px') + ' + ' + pixels(shift) + ')'});
    for (const item of breaks) { item.setAttribute('data-rapier-wrap-step', ''); steps.push(item); }
    for (const {quote, runs} of bars) {
      const look = css(quote), edge = box(quote).top + (parseFloat(look.borderTopWidth) || 0), barWidth = parseFloat(look.borderInlineStartWidth), color = look.borderInlineStartColor;
      style(quote, {'border-inline-start-color': 'transparent', ...(look.position === 'static' ? {position: 'relative'} : {})});
      for (const run of runs) {
        const bar = doc.createElement('span');
        bar.setAttribute('aria-hidden', 'true');
        bar.style.cssText = `position:absolute;inset-inline-start:${pixels(run.shift - barWidth)};top:${pixels(run.top - edge)};width:${pixels(barWidth)};height:${pixels(run.bottom - run.top)};background:${color};pointer-events:none`;
        quote.prepend(bar); floats.push(bar);
      }
    }
    return true;
  }

  function reflow() {
    if (stopped || busy) return;
    busy = true;
    try {
      restore();

      if (!root.isConnected || printing || view.matchMedia?.('print').matches) return;
      const children = [...root.children];
      if (children.length > 8192) return;
      // behind/front collapse and place like around/box but are never obstacles.
      const outOfFlow = value => value?.wrap === 'behind' || value?.wrap === 'front';
      const origin = box(root).top, obstacles = [], anchors = new Map(), wrapped = new Set(), placed = [], positionedImages = new Set();
      for (const element of children) {
        const layout = metadata.parseLayoutAttribute(element.getAttribute('data-md-layout'));
        const image = ['around', 'box', 'behind', 'front'].includes(layout?.wrap) && element.tagName === 'P'
          ? element.querySelector('img[data-rapier-image-layout]') : null;
        if (!image?.complete || !image.naturalWidth || !image.naturalHeight || !imageOnly(element, image)) continue;

        const owner = metadata.wrapNeighbour(element, neighbourKind);
        const computed = owner && css(owner);
        if (!owner || computed.writingMode !== 'horizontal-tb' || computed.transform !== 'none') continue;
        if (wrapped.size === 1024) { restore(); return; }
        const records = anchors.get(owner) || [];
        records.push({element, image, layout, width: box(image).width}); anchors.set(owner, records); wrapped.add(element); positionedImages.add(image);
        style(element, {position: 'relative', height: '0', 'min-height': '0', 'margin-top': '0', 'margin-bottom': '0', 'padding-top': '0', 'padding-bottom': '0', 'line-height': '0'});
        style(image, {position: 'absolute', margin: '0'});
      }
      // As the live editor.
      syncInlineRotatedPictures(positionedImages);
      for (const element of children) {
        if (wrapped.has(element)) continue;
        const bounds = box(element);
        if (!bounds.width || !bounds.height) continue;
        const computed = css(element), inset = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.borderLeftWidth) || 0);
        const width = bounds.width - inset - (parseFloat(computed.paddingRight) || 0) - (parseFloat(computed.borderRightWidth) || 0);

        for (const {element: source, image, layout, width: imageWidth} of anchors.get(element) || []) {
          // A picture sized in lines (`lines`) reads its anchor's line and stands on the first line's cap height, as the live editor.
          const lines = layout.lines != null ? geometry.lineMetrics(element) : null;
          const unrotated = geometry.imageBox(width, image.naturalWidth, image.naturalHeight, layout, imageWidth, lines);
          if (!unrotated) { restore(); return; }
          // rasterReserved (layout/model.mjs).
          const rasterRad = (layout.rotate || 0) * Math.PI / 180;
          const fit = geometry.rasterReserved(width, unrotated, rasterRad);
          if (!fit) { restore(); return; }
          const rectangle = fit.reserved, visualDeltaX = fit.visualDeltaX, visualDeltaY = fit.visualDeltaY;
          const left = bounds.left + inset + rectangle.x;
          const em = parseFloat(computed.fontSize) || 16;
          const topInset = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.borderTopWidth) || 0);
          const height = Math.max(0, bounds.height - topInset - (parseFloat(computed.paddingBottom) || 0) - (parseFloat(computed.borderBottomWidth) || 0));
          let y = bounds.top - origin + topInset + geometry.linesTop(layout, lines) + Math.min(layout.y || 0, height / em) * em;
          // The standoff and the room between pictures, in the reference scale's pixels, as the live editor.
          const scale = geometry.frameScale(image), room = 10 * scale;
          if (!outOfFlow(layout)) {
            // A picture an earlier one stands in moves down alone; its owner keeps its place, as in the editor.
            for (const obstacle of [...obstacles].sort((left, right) => left.y - right.y)) {
              if (obstacle.x < left + rectangle.width + room && obstacle.x + obstacle.width > left - room &&
                  obstacle.y + obstacle.height > y - room && obstacle.y < y + rectangle.height + room)
                y = obstacle.y + obstacle.height + room;
            }
            obstacles.push(...geometry.linesSlices(geometry.pictureSlices(profile(image, layout), left, y, rectangle.width, rectangle.height, scale), layout, lines, y, rectangle.height));
          }
          placed.push({source, image, rectangle, left, y, wrap: layout.wrap,
            visualLeft: left + visualDeltaX, visualTop: y + visualDeltaY, visualWidth: fit.fit.width, visualHeight: fit.fit.height,
            rotateDeg: layout.rotate || 0});
        }
        const top = bounds.top - origin, active = obstacles.filter(obstacle => obstacle.y + obstacle.height > top);
        if (active.length) {
          const own = active.map(obstacle => ({...obstacle, x: obstacle.x - bounds.left - inset}));
          const prepared = prepare(element);
          if (!(prepared && width > 0 && project(prepared, width, top, own)) && !(width > 0 && floatAround(element, width, bounds.height, top, own))) {
            // As the editor: only an outline that meets the block's box moves it.
            const overlapping = active.filter(obstacle => obstacle.y < top + bounds.height && obstacle.x < bounds.right && obstacle.x + obstacle.width > bounds.left);
            if (overlapping.length) clearTo(element, Math.max(...overlapping.map(obstacle => obstacle.y + obstacle.height)), origin);
          }
        }
      }
      for (const {source, image, rectangle, left, y, wrap, visualLeft, visualTop, visualWidth, visualHeight, rotateDeg} of placed) {
        const anchor = box(source);
        style(image, {position: 'absolute', left: pixels((visualLeft ?? left) - anchor.left), top: pixels((visualTop ?? y) - (anchor.top - origin)),
          width: pixels(visualWidth ?? rectangle.width), height: pixels(visualHeight ?? rectangle.height), 'max-width': 'none', margin: '0',
          transform: rotateDeg ? `rotate(${rotateDeg}deg)` : 'none', 'transform-origin': '50% 50%',
          // As the live editor.
          ...(wrap === 'behind' ? {'z-index': '-1'} : {})});
      }
      if (obstacles.length) {
        const end = Math.max(...obstacles.map(obstacle => obstacle.y + obstacle.height));
        const bottom = box(root).bottom - origin - (parseFloat(css(root).paddingBottom) || 0);
        if (end > bottom) {
          const tail = doc.createElement('div');
          tail.setAttribute('aria-hidden', 'true'); tail.style.height = pixels(end - bottom);
          root.append(tail); spacers.push(tail);
        }
      }
    } catch (_) { restore(); }
    finally { busy = false; }
  }

  function schedule() {
    if (scheduled || stopped) return;
    scheduled = view.requestAnimationFrame(() => { scheduled = 0; reflow(); });
  }

  function beforePrint() { printing = true; restore(); }
  function afterPrint() { printing = false; schedule(); }

  const observer = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(() => {
    const width = root.clientWidth;
    if (width !== lastWidth) { lastWidth = width; schedule(); }
  }) : null;
  observer?.observe(root);
  root.addEventListener('load', schedule, true);
  root.addEventListener('error', schedule, true);
  root.addEventListener('toggle', schedule, true);
  view.addEventListener('resize', schedule);
  view.addEventListener('pageshow', schedule);
  view.addEventListener('beforeprint', beforePrint);
  view.addEventListener('afterprint', afterPrint);
  doc.fonts?.addEventListener?.('loadingdone', schedule);
  Promise.resolve(doc.fonts?.ready).then(schedule, schedule);
  schedule();
  return Object.freeze({reflow, destroy() {
    stopped = true;
    if (scheduled) view.cancelAnimationFrame(scheduled);
    observer?.disconnect(); restore();
    root.removeEventListener('load', schedule, true);
    root.removeEventListener('error', schedule, true);
    root.removeEventListener('toggle', schedule, true);
    view.removeEventListener('resize', schedule);
    view.removeEventListener('pageshow', schedule);
    view.removeEventListener('beforeprint', beforePrint);
    view.removeEventListener('afterprint', afterPrint);
    doc.fonts?.removeEventListener?.('loadingdone', schedule);
  }});
}

function _rapierArtifactLayoutScript(root, nonce = '') {
  const dependencies = globalThis.RapierArtifactLayoutDependencies;
  // Every wrap value earns the reflow script, and an inline turned raster (keyed off data-rapier-image-layout).
  const layoutOf = element => globalThis.RapierMarkdownLayout.parseLayoutAttribute(element.getAttribute('data-md-layout'));
  const pictureLayoutOf = image => globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
  if (!dependencies?.factories ||
      (![...root.querySelectorAll('p[data-md-layout]')].some(element => ['around', 'box', 'behind', 'front'].includes(layoutOf(element)?.wrap)) &&
       ![...root.querySelectorAll('img[data-rapier-image-layout]')].some(image => pictureLayoutOf(image)?.rotate))) return '';
  const modules = _rapierArtifactFactoryModules(dependencies, 'layout');
  const script = '/* Rapier export layout: SPDX-License-Identifier: AGPL-3.0-only */\n' +
    '/* Pretext 0.0.9\n' + dependencies.license + '\n*/\n' +
    '(() => {\nconst modules = {};\n' + modules + '\n(' + _rapierProjectArtifactLayout.toString() +
    ')(document.querySelector("main.rapier-page"), modules["spec/md-layout.mjs"], modules["layout/model.mjs"], modules["agent/vendor/pretext/rich-inline.js"]);\n})();';

  return '<script' + (nonce ? ' nonce="' + nonce + '"' : '') + '>\n' + script.replace(/<\/script/gi, '<\\/script') + '\n</script>';
}

function _rapierArtifactInkScript(root, nonce = '') {
  const dependencies = globalThis.RapierArtifactLayoutDependencies;
  if (!dependencies?.factories || !dependencies.groups?.ink || !root.querySelector('span.rapier-ink-mark[data-rapier-ink]')) return '';
  const script = '/* Rapier export ink: the marks drawn from their own words. SPDX-License-Identifier: AGPL-3.0-only */\n' +
    '/* ' + dependencies.inkLicense + '\n*/\n' +
    '(() => {\nconst modules = {};\n' + _rapierArtifactFactoryModules(dependencies, 'ink') +
    '\nmodules["layout/ink-draw.mjs"].watchInk(document.querySelector("main.rapier-page"), modules["spec/md-marks.mjs"], modules["spec/ink.mjs"]);\n})();';
  return '<script' + (nonce ? ' nonce="' + nonce + '"' : '') + '>\n' + script.replace(/<\/script/gi, '<\\/script') + '\n</script>';
}

  return {_rapierDataImageDestinationsAsync, _rapierSharedSourceFormsAsync, _rapierPrefixPortableAnchorsSteps, _rapierProjectStyledRootAsync, _rapierBuildArtifact, _rapierProjectStyledRoot, _rapierPaintCode, _rapierPrefixPortableAnchors, _rapierDocumentSettingsOf, _rapierDocumentSettingsCss, _rapierExportedPageCsp, _rapierArtifactNonce, _rapierAnnotateExportBoxPolygons, _rapierSharedSourceHash, _rapierSharedSourceForms, _rapierSharedSourceCarrier, _rapierSharedResolve, _rapierReadSharedDocument, _rapierSharedPageFallbackCss, _rapierShareWrapKind, _rapierSharePictureParagraph, _rapierSharedPageLayout, _rapierShareCapLongCodeBlocks, _rapierRequireOfflinePageImages, _rapierCssValueUrls, _rapierBuildSharedPage, _rapierImageSources, _rapierImageDestinations, _rapierScanMarkdownImages, _rapierParseMarkdownImageDestination, _rapierImageOpenRunsList, _rapierArtifactFactoryModules, _rapierProjectArtifactLayout, _rapierArtifactLayoutScript, _rapierArtifactInkScript , render};
}
export {createRenderer};
