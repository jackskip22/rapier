// SPDX-License-Identifier: MIT
import {htmlImageRecord, htmlRuntimeSource} from '../spec/html-blocks.mjs';
import {finish, finishAsync, cloneTree, cleanTree, serializeTree, encodeUtf8Steps, pause} from './render-work.mjs';
import {fontFamilyCss} from '../spec/md-marks.mjs';
import {readFontAssets, documentFontsCss} from '../spec/document-fonts.mjs';
import {fontRequests, requireDocumentFonts} from './export-fonts.mjs';
import {documentLanguage, documentSettingsFonts, pageSizeOf} from '../spec/document-settings.mjs';
import {createLineMeasurer, linesHeight} from '../layout/model.mjs';
import {markPrintCapitals, createPrintCapitals, followingPrintProse} from './print-capitals.mjs';
import {freezePublishedInk} from './render-ink.mjs';
import {isTemplatePage, isPageBorderLayout} from '../spec/template-page.mjs';
export function positionNativeDiagram(drawing) {
  const surface=drawing?.closest?.('.diagram-block,.diagram-live-preview');
  if(!surface?.clientWidth)return;
  if(surface._rapierDiagramScroll){
    surface.scrollLeft=surface._rapierDiagramScroll.left;
    surface.scrollTop=surface._rapierDiagramScroll.top;
    delete surface._rapierDiagramScroll;
    surface._rapierDiagramPositioned=true;
    return;
  }
  if(surface._rapierDiagramPositioned)return;
  surface._rapierDiagramPositioned=true;
  if(surface.scrollLeft||!drawing.hasAttribute('data-rapier-diagram-start-x'))return;
  const start=Number(drawing.getAttribute('data-rapier-diagram-start-x')),
    view=(drawing.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
  if(!Number.isFinite(start)||view.length!==4||!(view[2]>0))return;
  const bounds=drawing.getBoundingClientRect(),host=surface.getBoundingClientRect(),
    left=bounds.left-host.left+(start-view[0])*bounds.width/view[2]-surface.clientWidth/2;
  surface.scrollLeft=Math.max(0,Math.min(surface.scrollWidth-surface.clientWidth,left));
}

function createRenderer(runtime) {
  const {RapierLedgerCarried, RapierPageReturnAddress, RapierTextCodec, _rapierArtifactHighlight, _rapierArtifactPreference, _rapierArtifactStyles, _rapierBlobDataUrl, _rapierBuildInterchangeContext, _rapierDocumentNameIsAdmissible, _rapierLedgerParts, _rapierDrawReadSVGRecipe, _rapierDrawShapeProfileFor, _rapierExportFontCss, _rapierFillDiagram, _rapierFinalizeExportCode, _rapierLanguageClass, _rapierLineStartOffsets, _rapierMarkdownEnvironment, _rapierPortableHtml, _rapierPrepareInterchangeContext, _rapierProjectPortableRoot, _rapierProviders, _rapierSourceCharEscaped, _rapierSourceLineSpan, crypto, document, escapeRapierHtmlText, globalThis, sanitizeRapierHtml} = runtime;
  let md = runtime.md;
  async function render(source, options = {}) {
    if (typeof source !== 'string') throw new TypeError('Document source must be a string');
    const filename = options.filename || 'document.md';
    if (typeof filename !== 'string' || !filename || /[\\/\u0000-\u001f\u007f]/.test(filename)) throw new TypeError('Invalid document filename');
    const bom = source.charCodeAt(0) === 0xfeff;
    let canonical = RapierTextCodec.normalizeDocument(source);
    if ((!options.docKind || options.docKind === 'markdown') && runtime.materializeDocumentFonts)
      canonical = await runtime.materializeDocumentFonts(canonical, {parser: md});
    const captured = {canonical, metadata: {filename, docKind: options.docKind || 'markdown', codeLang: options.codeLang || '', bom}, baseName: filename.replace(/\.[^.]*$/, '') || 'document'};
    const written = await _rapierBuildSharedPage(captured);
    return {html: await written.blob.text(), filename: written.filename};
  }
async function _rapierBuildArtifact(options, providedContext) {
	const opts = options || {};
	const context = providedContext || _rapierBuildInterchangeContext(opts);
	const preference = _rapierArtifactPreference('theme', ['system', 'light', 'dark']);
	const theme = opts.print ? 'light' : preference === 'system'
		? (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
	const metadata = context.metadata;
	const base = context.baseName;
	const work = context.work || opts.work;
	const completePage = opts.kind === 'standalone' || opts.kind === 'page';
	const settings = _rapierDocumentSettingsOf(context.canonical);
	const language = documentLanguage(settings, globalThis.navigator?.language);
	const fontIndex = metadata.docKind === 'markdown' ? readFontAssets(context.canonical, md) : null;
	const fontAssets = fontIndex?.assets || [];
	const fontCss = documentFontsCss(fontAssets);

	if (opts.kind === 'publishing' || opts.kind === 'fragment') {
		for (const diagram of context.semanticRoot.querySelectorAll('.diagram-block[data-diagram-native]'))
			await _rapierFillDiagram(diagram, true);
		const portableRoot = work ? await runtime._rapierProjectPortableRootAsync(context.semanticRoot, {baseName: base, keepDiagrams: true, work})
			: _rapierProjectPortableRoot(context.semanticRoot, { baseName: base, keepDiagrams: true });
		for (const element of portableRoot.children) if (!element.hasAttribute('lang')) element.setAttribute('lang', language);
		if (fontCss || settings?.defaultfont) {
			const {main, sans: heading, mono: code} = documentSettingsFonts(settings), body = main || heading;
			if (body) for (const element of portableRoot.children)
				if (!element.matches('pre,code,kbd,samp,svg,math') && !element.style.fontFamily)
					element.style.fontFamily = body.css || fontFamilyCss(body.family);
			if (heading) for (const element of portableRoot.querySelectorAll('h1,h2,h3,h4,h5,h6'))
				element.style.fontFamily = heading.css || fontFamilyCss(heading.family);
			if (code) for (const element of portableRoot.querySelectorAll('pre,code,kbd,samp'))
				element.style.fontFamily = code.css || fontFamilyCss(code.family);
		}
		if (fontIndex) await requireDocumentFonts(context.canonical, {parser: md, index: fontIndex, root: portableRoot, settings, fontCss, validateFont: runtime.validateFont,
			css: _rapierArtifactStyles('system', false, false, false, '') + '\n' + _rapierDocumentSettingsCss(settings)});
		const html = work ? await runtime._rapierPortableHtmlAsync(portableRoot, work) : _rapierPortableHtml(portableRoot);
		return {
			html: (fontCss ? '<style>' + fontCss + '</style>\n' : '') + html,
			filename: base + '-publishing.html',
			metadata,
		};
	}

	const unavailable = plugin => Object.assign(new Error('Offline web page not written; install the ' + plugin + ' plug-in before exporting this document.'),
		{code: 'offline_plugin_unavailable', plugin});
	if (completePage && context.semanticRoot.querySelector('.math-placeholder[data-rapier-math-source]')) throw unavailable('math');
	for (const diagram of context.semanticRoot.querySelectorAll('.diagram-block[data-diagram-src]')) {
		const retained = diagram.getAttribute('data-diagram-state') === 'ready' && diagram.querySelector('.diagram-cache')?.querySelector('svg');
		if (!(completePage && retained && _rapierProviders?.mermaid?.status !== 'ready')) await _rapierFillDiagram(diagram, true);
		if (!completePage || diagram.hasAttribute('data-diagram-unclosed')) continue;
		if (diagram.getAttribute('data-diagram-state') === 'absent') throw unavailable('mermaid');
		if (diagram.getAttribute('data-diagram-state') !== 'ready' || !diagram.querySelector('.diagram-cache svg'))
			throw Object.assign(new Error('Web page not written; a required diagram could not be rendered'), {code: 'EXPORT_DIAGRAM_UNAVAILABLE'});
	}

	if (completePage) {
		if (context.semanticRoot.querySelector('span[data-rapier-math-source]'))
			throw new Error('Web page not written; a required equation could not be rendered');
		await _rapierRequireOfflinePageImages(context.semanticRoot);
	}
	if (!completePage) for (const image of context.semanticRoot.querySelectorAll('svg image')) {
		const href = image.getAttribute('data-rapier-remote-src') || image.getAttribute('href') || image.getAttribute('xlink:href') || '';
		if (!globalThis.RapierImageAssets.dataImage(href)) throw new Error('Embed the diagram picture before exporting an offline page: ' + href);
	}

	const styledOptions = {metadata, print: !!opts.print, baseName: base, work};
	const styledRoot = work ? await _rapierProjectStyledRootAsync(context.semanticRoot, styledOptions)
		: _rapierProjectStyledRoot(context.semanticRoot, styledOptions);
	styledRoot.setAttribute('lang', language);
	const darkPaper = theme === 'dark' && _rapierArtifactPreference('invertImageAlpha', ['true', 'false']) !== 'false';
	const templatePage = _rapierTemplatePage(context.canonical, settings, styledRoot, darkPaper);
	if (completePage && typeof _rapierFinalizeExportCode === 'function') await _rapierFinalizeExportCode(styledRoot);
	if (!opts.print) _rapierAnnotateExportBoxPolygons(styledRoot);
	if (completePage || opts.print) {
		if (work) await finishAsync(_rapierSharedPageLayoutSteps(styledRoot), work);
		else _rapierSharedPageLayout(styledRoot);
	}
	if (completePage && !opts.print) {
		if (work) await finishAsync(_rapierShareCapLongCodeBlocksSteps(styledRoot), work);
		else _rapierShareCapLongCodeBlocks(styledRoot);
	}
	if (typeof opts.afterRoot === 'function') await opts.afterRoot(styledRoot);
	markPrintCapitals(styledRoot);
	const highlights = _rapierArtifactPreference('highlights', ['accent', 'standard']);
	const invertImageAlpha = _rapierArtifactPreference('invertImageAlpha', ['true', 'false']) !== 'false';
	const versionMeta = document.querySelector('meta[name="rapier-version"]');
	const version = versionMeta && versionMeta.content ? versionMeta.content.trim() : '0.0.0';
	const bodyClass = theme === 'light' ? 'light' : '';
	const docClass = metadata.docKind === 'markdown'
		? 'rapier-page md-render'
		: 'rapier-page rapier-document--flat';
	const includeFonts = !!opts.print;
	const willFont = opts.print && opts.willFont ? opts.willFont : null;
	const settingsCss = _rapierDocumentSettingsCss(settings);
	const refined = styledRoot.querySelector('p[data-md-hyphens="auto"],p[data-md-lines],p[data-md-caps="small"],p[data-md-hanging="on"],img[data-rapier-print-lines]');
	const printLeft = settings?.geometry ? settings.geometry.left / 15 : 14 * 96 / 25.4;
	const printRight = settings?.geometry ? settings.geometry.right / 15 : 14 * 96 / 25.4;
	const printWidth = settings?.papersize ? settings.papersize.width / 15 - printLeft - printRight : null;
	const typographyPrintCss = refined ? '@media print{.md-render{--rapier-print-margin-left:' + printLeft + 'px;--rapier-print-margin-right:' + printRight + 'px'
		+ (printWidth > 0 ? ';--rapier-print-width:' + printWidth + 'px' : '') + '}'
		+ (printWidth > 0 ? '.rapier-page.md-render{width:' + printWidth + 'px!important}' : '') + '}' : '';
	const pageTitle = settings && settings.title ? globalThis.RapierMarkdownSpec.documentTitle(settings) : metadata.filename;
	let css = _rapierArtifactStyles(theme, includeFonts, !!opts.print || completePage, false, opts.print && opts.kind === 'standalone' ? '' : null)
		+ (completePage || opts.print ? '\n\n' + _rapierSharedPageFallbackCss(!completePage) : '')
		+ (opts.extraCss ? '\n\n' + opts.extraCss : '')
		+ (willFont ? '\n\n@font-face{font-family:' + willFont.family + ';src:url(' + await _rapierBlobDataUrl(new Blob([willFont.bytes], { type: 'font/ttf' })) + ') format("truetype")}' : '')
		+ (settingsCss ? '\n' + settingsCss : '')
		+ (typographyPrintCss ? '\n' + typographyPrintCss : '')
		+ (templatePage ? '\n' + templatePage.css : '');
	let factoryFontCss = '';
	if (!opts.print) {
		if (fontIndex) await requireDocumentFonts(context.canonical, {parser: md, index: fontIndex, root: styledRoot, settings, css, fontCss, validateFont: runtime.validateFont});
		if (typeof _rapierExportFontCss === 'function')
			factoryFontCss = await _rapierExportFontCss(styledRoot, {settings, css, theme, portableFactory: true, customFontCss: fontCss});
		if (factoryFontCss) css += '\n' + factoryFontCss;
	} else if (opts.kind === 'standalone') {
		const fonts = await _rapierExportFontCss(styledRoot, {settings, css, theme});
		if (fonts) css += '\n' + fonts;
	}
	if (fontCss) css += '\n' + fontCss;
	if (typeof opts.afterFonts === 'function') await opts.afterFonts(styledRoot, {css, fontCss, settings, language, theme});
	const carrier = completePage ? await _rapierSharedSourceCarrier(context, styledRoot) : '';
	const bodyHtml = work
		? await finishAsync(serializeTree(styledRoot), work) : styledRoot.innerHTML;
	if (work) await pause(work, .95);
	const nonce = _rapierArtifactNonce();
	const layoutScript = opts.scripts !== false ? _rapierArtifactLayoutScript(styledRoot, nonce, {pictures:!opts.print}) : '';
	const inkScript = !opts.print && opts.scripts !== false ? _rapierArtifactInkScript(styledRoot, nonce) : '';
	const htmlScript = !opts.print && opts.scripts !== false && styledRoot.querySelector('[data-rapier-html],[data-rapier-animation]') ? '<script nonce="' + nonce + '">' + htmlRuntimeSource().replace(/<\/script/gi, '<\\/script') + '</script>' : '';
	const page = '<!DOCTYPE html>\n'
		+ '<html lang="' + escapeRapierHtmlText(language) + '" data-rapier-theme="' + theme + '" data-highlights="' + highlights + '" data-invert-image-alpha="' + (invertImageAlpha ? 'on' : 'off') + '">\n'
		+ '<head>\n<meta charset="UTF-8">\n' + (carrier ? RapierPageReturnAddress.PAGE_SEED + '\n' : '')
		+ '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
		+ '<meta name="responsive-embedded-sizing" content="allow-origins=*">\n'
		+ '<meta http-equiv="Content-Security-Policy" content="' + _rapierExportedPageCsp(layoutScript || inkScript || htmlScript ? nonce : '', includeFonts || !!fontCss || !!factoryFontCss) + '">\n'
		+ '<meta name="referrer" content="no-referrer">\n'
		+ '<link rel="icon" href="data:,">\n'
		+ _rapierPagePreviewMeta(styledRoot, pageTitle)
		+ '<meta name="generator" content="Rapier ' + escapeRapierHtmlText(version) + '">\n'
		+ '<title>' + escapeRapierHtmlText(pageTitle) + '</title>\n'
		+ '<style>' + css + '</style>\n</head>\n'
		+ '<body class="' + bodyClass + '">' + (templatePage ? '<div class="rapier-template-border" aria-hidden="true"></div>' : '') + '<main class="' + docClass + '" data-md-theme="' + theme + '">'
		+ bodyHtml + '</main>' + carrier + layoutScript + inkScript + htmlScript + '</body>\n</html>';

	return {
		html: page,
		filename: base + '.html',
		bodyHtml,
		css,
		fontCss,
		fontRequests: fontCss ? fontRequests(styledRoot, {settings, css, fontCss}) : [],
		settings,
		templatePage: templatePage && {url: templatePage.url, width: templatePage.width, height: templatePage.height, margins: templatePage.margins},
		docClass,
		language,
		metadata,
		documentTitle: settings && settings.title ? pageTitle : '',
	};
}

function _rapierTemplatePage(canonical, settings, root, darkPaper = false) {
	if (!isTemplatePage(canonical)) return null;
	const paper = pageSizeOf(settings);
	let url = '';
	for (const paragraph of root.querySelectorAll(':scope > p[data-md-layout]')) {
		const image = paragraph.querySelector('img');
		const layout = globalThis.RapierMarkdownLayout.parseLayoutAttribute(paragraph.getAttribute('data-md-layout'));
		const source = image?.getAttribute('src') || '';
		if (isPageBorderLayout(layout) && globalThis.RapierImageAssets.dataImage(source)) { url = source; paragraph.remove(); break; }
	}
	if (!url) return null;
	const width = paper.width / 15, height = paper.height / 15;
	const margins = ['top', 'right', 'bottom', 'left'].map(side => (settings?.geometry?.[side] ?? 1440) / 15);
	const padding = margins.map(value => value + 'px').join(' ');
	const ground = 'background:var(--rapier-template-border) 0 0/100% 100% no-repeat';
	const shown = darkPaper && globalThis.RapierImageAssets.dataImage(url)?.codec === 'image/svg+xml' ? _rapierDarkPaperSvgUrl(url, '#fafafa') : url;
	const css = ':root{--rapier-template-border:url("' + url + '")}\n'
		+ '@media screen{' + (shown !== url ? ':root{--rapier-template-border:url("' + shown + '")}' : '') + '.rapier-template-border{display:none}body{background:var(--md-color-inset)}.rapier-page{box-sizing:border-box;width:min(100%,' + width + 'px);min-height:' + height + 'px;margin:0 auto;padding:' + padding
		+ ';background:var(--rapier-template-border) 0 0/100% ' + height + 'px repeat-y,var(--md-color-bg);color:var(--md-color-text)}}\n'
		+ '@media screen and (max-width:' + width + 'px){.rapier-page{min-height:auto;aspect-ratio:' + width + '/' + height + ';padding:'
		+ margins.map(value => 'min(' + value + 'px,' + Number((value / width * 100).toFixed(4)) + '%)').join(' ') + ';background-size:100% auto,auto}}\n'
		+ '@media print{@page{size:' + width + 'px ' + height + 'px;margin:0}html,body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
		+ '.rapier-page{box-sizing:border-box;width:auto;max-width:none;margin:0;padding:' + padding + '!important;position:relative!important;z-index:1;box-decoration-break:clone;-webkit-box-decoration-break:clone}'
		+ '.rapier-template-border{display:block;position:fixed;left:0;top:0;width:' + width + 'px;height:' + height + 'px;z-index:0;' + ground + '}}';
	return {url, width, height, margins, css};
}

function _rapierDarkPaperSvgUrl(url, paperInk) {
	const ink = globalThis.RapierImageInspection?.inkForPaper;
	if (typeof ink !== 'function') return url;
	let text;
	try { text = new TextDecoder('utf-8', {fatal: true}).decode(globalThis.RapierImageAssets.decodeDataImageBytes(url).bytes); }
	catch (_) { return url; }
	const inked = ink(text, {dark: true, paperInk});
	if (inked === text) return url;
	let binary = '';
	for (const byte of new TextEncoder().encode(inked)) binary += String.fromCharCode(byte);
	return 'data:image/svg+xml;base64,' + btoa(binary);
}

function _rapierPagePreviewMeta(root, fallbackTitle) {
	const words = node => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
	const title = words(root.querySelector('h1,h2,h3,h4,h5,h6')) || String(fallbackTitle || '');
	const text = [...root.querySelectorAll('p')].map(words).find(line => line.length >= 20) || '';
	const sentence = /^.{20,300}?[.!?](?=\s|$)/.exec(text)?.[0] || (text.length <= 200 ? text : text.slice(0, 200).replace(/\s+\S*$/, '') + '…');
	const meta = (key, name, value) => '<meta ' + key + '="' + name + '" content="' + escapeRapierHtmlText(value) + '">\n';
	return (sentence ? meta('name', 'description', sentence) : '') + (title ? meta('property', 'og:title', title) : '') +
		(sentence ? meta('property', 'og:description', sentence) : '');
}

async function _rapierBuildPublishedPage(context) {
	if (typeof context?.canonical !== 'string' || !context.semanticRoot)
		throw new TypeError('Publishing requires a captured document.');
	const current = {...context, ledger: null, carried: 'none', comparisonBase: null};
	return _rapierBuildArtifact({
		kind: 'standalone', scripts: false,
		afterFonts: (root, style) => freezePublishedInk(root, {...style, document, work: current.work,
			spec: globalThis.RapierMarkdownSpec, ink: globalThis.RapierInk, draw: globalThis.RapierInkDraw}),
	}, current);
}

function _rapierProjectStyledRoot(semanticRoot, options) { return finish(_rapierProjectStyledRootSteps(semanticRoot, options)); }
async function _rapierProjectStyledRootAsync(semanticRoot, options = {}) { return finishAsync(_rapierProjectStyledRootSteps(semanticRoot, options), options.work); }

function* _rapierProjectStyledRootSteps(semanticRoot, options) {
	const opts = options || {};
	const root = yield* cloneTree(semanticRoot);
	for (const token of root.querySelectorAll('.rapier-source-token--softbreak')) { yield;
		if (token.getAttribute('data-rapier-source') !== '%0A') token.replaceWith(...token.childNodes);
		else if (token.previousSibling?.classList?.contains('callout__label')) token.remove();
		else token.replaceWith(root.ownerDocument.createTextNode(token.closest('pre') ? '\n' : ' '));
	}
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
			if (metadata.docKind === 'code') _rapierPaintCode(code, _rapierArtifactHighlight(code.textContent || '', lang));
			if (lang) code.classList.add('language-' + String(lang).replace(/[^a-z0-9_-]/gi, ''));
		}
	} else {
		for (const code of root.querySelectorAll('pre > code')) { yield;
			if (code.parentElement?.classList.contains('diagram-source') &&
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
			if (item) {
				const label = item.cloneNode(true);
				for (const node of label.querySelectorAll('input,ul,ol')) { yield; node.remove(); }
				input.setAttribute('aria-label', String(label.textContent || '').replace(/\s+/g, ' ').trim() || 'Task');
			}
			input.disabled = !!opts.print || !item;
			if (input.disabled) { input.setAttribute('aria-disabled', 'true'); continue; }
			input.removeAttribute('aria-disabled');
			input.removeAttribute('aria-checked');
			input.setAttribute('autocomplete', 'off');
			input.setAttribute('title', 'Ticks change this view, not the saved file.');
		}

		if (opts.print) for (const details of root.querySelectorAll('details')) { yield; details.open = true; }
	}

	yield* _rapierPrefixPortableAnchorsSteps(root, opts.baseName || metadata.filename || 'document');

	return yield* cleanTree(root, sanitizeRapierHtml, 'export');
}

function _rapierDocxRenderStyles(root) {
	const codes = Array.from(root.querySelectorAll('pre > code'));
	for (const code of codes) {
		const lang = _rapierLanguageClass(code);
		if (lang) _rapierPaintCode(code, _rapierArtifactHighlight(code.textContent || '', lang));
	}
	const coloured = codes.filter(code => code.querySelector('span'));
	const quotes = Array.from(root.querySelectorAll('blockquote'));
	const diagrams = Array.from(root.querySelectorAll('svg.pele'));
	if (!coloured.length && !quotes.length && !diagrams.length) return;
	const frame = document.createElement('iframe');
	frame.setAttribute('aria-hidden', 'true');
	frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1px;height:1px;border:0;pointer-events:none';
	document.body.appendChild(frame);
	try {
		const into = frame.contentDocument;
		if (!into?.body) throw new Error('Word text styles could not be read.');
		into.open(); into.write('<!doctype html><html><head></head><body></body></html>'); into.close();
		into.documentElement.setAttribute('data-rapier-theme', 'light');
		into.documentElement.setAttribute('data-highlights', _rapierArtifactPreference('highlights', ['accent', 'standard']));
		into.body.className = 'light';
		const sheet = into.createElement('style');
		sheet.textContent = _rapierArtifactStyles('light', false, false);
		into.head.appendChild(sheet);
		const surface = into.createElement('div'); surface.className = 'md-render';
		surface.setAttribute('data-md-theme', 'light'); into.body.appendChild(surface);
		const canvas = into.createElement('canvas'); canvas.width = canvas.height = 1;
		const paint = canvas.getContext('2d'), colours = new Map();
		if (!paint) throw new Error('Word text colors could not be read.');
		const hex = colour => {
			if (!colours.has(colour)) {
				paint.fillStyle = '#ffffff'; paint.fillRect(0, 0, 1, 1);
				paint.fillStyle = colour; paint.fillRect(0, 0, 1, 1);
				colours.set(colour, '#' + Array.from(paint.getImageData(0, 0, 1, 1).data).slice(0, 3)
					.map(byte => byte.toString(16).padStart(2, '0')).join(''));
			}
			return colours.get(colour);
		};
		for (const diagram of diagrams) {
			const host = into.createElement('div'); host.className = 'diagram-block';
			const probe = into.importNode(diagram, true); host.appendChild(probe); surface.appendChild(host);
			const originals = [diagram, ...diagram.querySelectorAll('*')];
			[probe, ...probe.querySelectorAll('*')].forEach((element, index) => {
				const computed = into.defaultView.getComputedStyle(element), target = originals[index];
				for (const property of ['fill', 'stroke', 'color', 'stop-color', 'stroke-width', 'stroke-dasharray',
					'font-family', 'font-size', 'font-weight', 'font-style', 'rx', 'ry']) {
					const value = computed.getPropertyValue(property);
					if (value && !/url\(/i.test(value)) target.style.setProperty(property, value);
				}
			});
			host.remove();
		}
		for (const code of coloured) {
			const pre = into.createElement('pre'), probe = into.importNode(code, true);
			pre.appendChild(probe); surface.appendChild(pre);
			const originals = Array.from(code.querySelectorAll('span'));
			Array.from(probe.querySelectorAll('span')).forEach((span, index) => {
				const style = into.defaultView.getComputedStyle(span), target = originals[index];
				target.style.color = hex(style.color);
				target.style.fontWeight ||= style.fontWeight === style.getPropertyValue('--md-fw-semibold').trim() ? 'bold' : style.fontWeight;
				target.style.fontStyle = style.fontStyle;
			});
			pre.remove();
		}
		const quoteProbes = new Map();
		for (const quote of quotes) {
			const probe = into.createElement('blockquote'); probe.className = quote.className;
			probe.style.borderInlineStartColor = quote.style.borderInlineStartColor;
			const parent = quoteProbes.get(quote.parentElement?.closest('blockquote')) || surface;
			parent.appendChild(probe); quoteProbes.set(quote, probe);
		}
		for (const [quote, probe] of quoteProbes)
			quote.style.borderInlineStartColor = hex(into.defaultView.getComputedStyle(probe).borderInlineStartColor);
	} finally { frame.remove(); }
}

function _rapierPaintCode(el, html) {
	el.innerHTML = html;
	el.classList.add('tok');
}

function _rapierPrefixPortableAnchors(root, baseName) { return finish(_rapierPrefixPortableAnchorsSteps(root, baseName)); }

function _rapierPortableAnchorId(baseName, id) {
	const slug = String(baseName || 'document').toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'document';
	return 'rapier-anchor-' + slug + '-' + (String(id).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'anchor');
}

function* _rapierPrefixPortableAnchorsSteps(root, baseName) {
	const ids = new Map(), svgIds = new Map();
	const used = new Set();
	const scopeOf = element => {
		if (typeof element?.closest !== 'function') return null;
		let svg = element.closest('svg');
		while (typeof svg?.parentElement?.closest === 'function' && svg.parentElement.closest('svg')) svg = svg.parentElement.closest('svg');
		return svg;
	};

	for (const element of root.querySelectorAll('[id]')) { yield;
		const oldId = element.id;
		if (!oldId) continue;
		const first = _rapierPortableAnchorId(baseName, oldId);
		let nextId = first;
		let suffix = 2;
		while (used.has(nextId)) nextId = first + '-' + suffix++;
		used.add(nextId);
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
	return "default-src 'none'; connect-src 'none'; frame-src 'self'; img-src data:; style-src 'unsafe-inline'; "
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
		const url = image.getAttribute('src') || '';
		if (globalThis.RapierImageAssets.dataImage(url)?.codec !== 'image/svg+xml') continue;
		let text;
		try { text = new TextDecoder('utf-8', { fatal: true }).decode(globalThis.RapierImageAssets.decodeDataImageBytes(url).bytes); }
		catch (_) { continue; }
		let recipe;
		try { recipe = _rapierDrawReadSVGRecipe(text); } catch (_) { continue; }
		if (!recipe) continue;
		const view = recipe.view && recipe.view.w > 0 && recipe.view.h > 0 ? recipe.view : { x: 0, y: 0, w: recipe.canvas.w, h: recipe.canvas.h };
		if (layout.wrap === 'around') {
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

function _rapierSharedSourceForms(source, root) { return finish(_rapierSharedSourceFormsSteps(source, root)); }
async function _rapierSharedSourceFormsAsync(source, root, work) {
	const destinations = await _rapierDataImageDestinationsAsync(source, work);
	return finishAsync(_rapierSharedSourceFormsSteps(source, root, destinations), work);
}
function* _rapierSharedSourceFormsSteps(source, root, preparedDestinations = null) {
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
	const carrierEdits = [];
	const used = [], definitions = [];
	for (const row of destinations) {
		yield;
		const image = byUrl.get(row.destination);
		if (!image) continue;
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
		carrierEdits.push({start: row.start, end: row.end, text: '#' + id});
	}
	let carried = '', cursor = source.length;
	for (const edit of carrierEdits) {
		yield;
		carried = edit.text + (yield* _rapierSharedEncodeSteps(source.slice(edit.end, cursor))) + carried;
		cursor = edit.start;
	}
	carried = (yield* _rapierSharedEncodeSteps(source.slice(0, cursor))) + carried;
	return { resolved: source, carried, ids: used, definitions };
}

async function _rapierSharedSourceCarrier(context, root) {
	const source = (context.metadata.bom ? '\uFEFF' : '') + context.canonical;
	const forms = context.work ? await _rapierSharedSourceFormsAsync(source, root, context.work)
		: _rapierSharedSourceForms(source, root);
	const esc = escapeRapierHtmlText;
	return '<script type="' + _RAPIER_SHARED_SOURCE_TYPE + '" data-filename="' + esc(context.metadata.filename) +
		'" data-kind="' + esc(context.metadata.docKind) + '" data-sha256="' + await _rapierSharedSourceHash(forms.resolved, context.work) +
		'"' + (forms.ids.length ? ' data-images="' + forms.ids.join(' ') + '"' : '') +
		(forms.definitions.length ? ' data-image-definitions="' + forms.definitions.map(encodeURIComponent).join(' ') + '"' : '') + '>\n' +
		forms.carried + '\n</script>\n' +
		(RapierLedgerCarried ? RapierLedgerCarried.writeParts(forms.resolved, _rapierLedgerParts(forms.resolved, context.ledger, context.carried)) +
			RapierLedgerCarried.writeBase(forms.resolved, context.comparisonBase) : '');
}

function _rapierSharedResolve(text, ids, images, definitions) {
	if (!ids.length) return { text, broken: false };
	const id = '(' + ids.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')';
	let broken = false;
	const src = value => {
		const found = images.get(value);
		if (!globalThis.RapierImageAssets.dataImage(found)) { broken = true; return null; }
		return found;
	};
	const inline = new RegExp('(\\]\\([ \\t\\r\\n]*(?:&lt;)?)#' + id + '(?=>?[ \\t\\r\\n]*\\)|>?[ \\t\\r\\n]+["\'(])', 'g');
	const definition = new RegExp('(^[ \\t>]*(?:(?:[-+*]|\\d{1,9}[.)])[ \\t]+[ \\t>]*)*\\[((?:\\\\.|[^\\]\\\\])+)\\]:[ \\t]*(?:(?:\\r\\n|\\r|\\n)[ \\t>]*)?(?:&lt;)?)#' + id + '(?=>?[ \\t]*$|>?[ \\t]+["\'(])', 'gm');
	const swapInline = (match, lead, value) => { const found = src(value); return found == null ? match : lead + found; };
	const swapDefinition = (match, lead, label, value) => {
		const decoded = _rapierSharedDecode(label), quoted = decoded.replace(/\r?\n[ \t]*(?:>[ \t]*)+/g, ' ');
		if (!definitions.has(md.utils.normalizeReference(decoded)) && !definitions.has(md.utils.normalizeReference(quoted))) return match;
		const found = src(value);
		return found == null ? match : lead + found;
	};
	return { text: text.replace(inline, swapInline).replace(definition, swapDefinition), broken };
}

async function _rapierReadSharedDocument(text, filename) {
	const html = String(text);
	if (!/\.html?$/i.test(filename || '') || !html.includes('type="' + _RAPIER_SHARED_SOURCE_TYPE + '"')) return null;
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
	let definitions;
	try { definitions = new Set(definitionTokens.map(decodeURIComponent)); } catch (_) { return invalid(); }
	let source = carrier.textContent;
	if (source.startsWith('\n')) source = source.slice(1);
	if (source.endsWith('\n')) source = source.slice(0, -1);
	source = source.replace(/&#13;/g, '\r');
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

function _rapierSharedPageFallbackCss(clearOnly = false) {
	const clear = '.rapier-page>:is(pre,table,hr,figure,.table-scroll-wrap,.math-display-wrap){clear:both}\n';
	return clearOnly ? clear : `
.rapier-page{display:flow-root}
.rapier-page>:first-child{margin-top:0}
.md-render h1{display:flow-root}
` + clear;
}

function _rapierShareWrapKind(element) {
	if (globalThis.RapierMarkdownLayout.wrapTextBlock(element)) return 'prose';
	const image = element.tagName === 'P' ? element.querySelector('img') : null;
	if (image && globalThis.RapierImageLayout.imageOnly(element, image)) return 'picture';
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
	const assignments = [];
	for (const image of root.querySelectorAll('img[data-rapier-image-layout]')) {
		yield;
		const layout = globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
		if (layout?.wrap !== 'around' && layout?.wrap !== 'box') continue;
		const paragraph = _rapierSharePictureParagraph(image);
		if (!paragraph) continue;
		const owner = globalThis.RapierMarkdownLayout.wrapNeighbour(paragraph, _rapierShareWrapKind);
		if (owner) assignments.push({image, paragraph, layout, owner});
	}
	for (const {image, paragraph, layout, owner} of assignments) {
		yield;
		const side = (layout.x ?? 0) < 50 ? 'left' : 'right';
		paragraph.style.cssText = 'float:' + side + ';max-width:100%;margin:0 ' + (side === 'left' ? '1rem 1rem 0' : '0 1rem 1rem');
		if (layout.y > 0) {
			paragraph.style.marginTop = layout.y + 'em';
			paragraph.style.setProperty('shape-outside', 'inset(' + layout.y + 'em 0 0)');
		}
		image.style.margin = '0';
		const naturalWidth = Number(image.getAttribute('width')) || 0, naturalHeight = Number(image.getAttribute('height')) || 0;
		let turned = '';
		const turnedCorners = (bounds, width, height, rad) => {
			const cos = Math.cos(rad), sin = Math.sin(rad), round = value => Math.round(value * 100) / 100 + '%';
			return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
				const dx = x * width / 2, dy = y * height / 2;
				return round(50 + (dx * cos - dy * sin) / bounds.width * 100) + ' ' + round(50 + (dx * sin + dy * cos) / bounds.height * 100);
			}).join(', ');
		};
		if (layout.rotate && naturalWidth > 0 && naturalHeight > 0) {
			const rad = layout.rotate * Math.PI / 180, aspect = naturalHeight / naturalWidth;
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
				turned = turnedCorners(bounds, width, height, rad);
				paragraph.style.width = bounds.width + '%';
				paragraph.style.paddingTop = ((bounds.height - height) / 2) + '%';
				paragraph.style.paddingBottom = ((bounds.height - height) / 2) + '%';
				image.style.width = (width / bounds.width * 100) + '%';
				image.style.marginLeft = image.style.marginRight = (((bounds.width - width) / 2) / bounds.width * 100) + '%';
			} else {
				const bounds = globalThis.RapierImageLayout.rotatedBoundsRad(naturalWidth, naturalHeight, rad);
				turned = turnedCorners(bounds, naturalWidth, naturalHeight, rad);
				paragraph.style.width = bounds.width + 'px';
				paragraph.style.paddingTop = ((bounds.height - naturalHeight) / 2) + 'px';
				paragraph.style.paddingBottom = ((bounds.height - naturalHeight) / 2) + 'px';
				image.style.width = naturalWidth + 'px';
				image.style.marginLeft = image.style.marginRight = ((bounds.width - naturalWidth) / 2) + 'px';
			}
		} else if (layout.lines != null) {
			image.style.width = 'auto';
			image.style.height = globalThis.RapierMarkdownLayout.linesHeightCss(layout.lines);
		} else {
			if (layout.width != null) paragraph.style.width = layout.width + '%';
			else if (image.getAttribute('width')) paragraph.style.width = image.getAttribute('width') + 'px';
			if (layout.width != null || image.getAttribute('width')) image.style.width = '100%';
		}
		if (layout.rotate) { image.style.transform = 'rotate(' + layout.rotate + 'deg)'; image.style.transformOrigin = '50% 50%'; }
		if (turned) paragraph.style.setProperty('shape-outside', 'polygon(' + turned + ') padding-box');
		if (layout.wrap === 'around' && !layout.rotate && !layout.y && layout.width == null && !image.dataset.rapierContour?.endsWith('-box')) {
			const src = image.getAttribute('src');
			if (src) {
				paragraph.style.setProperty('shape-outside', 'url("' + src + '")');
				paragraph.style.setProperty('shape-image-threshold', '0.1');
			}
		}
		paragraph.classList.add('rapier-wrap-picture');
		owner.before(paragraph);
	}
	const positionedAssignments = [];
	for (const image of root.querySelectorAll('img[data-rapier-image-layout]')) {
		yield;
		const layout = globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
		if (layout?.wrap !== 'behind' && layout?.wrap !== 'front') continue;
		const paragraph = _rapierSharePictureParagraph(image);
		if (paragraph) positionedAssignments.push({image, paragraph, layout, owner: globalThis.RapierMarkdownLayout.wrapNeighbour(paragraph, _rapierShareWrapKind)});
	}
	for (const {image, paragraph, layout, owner} of positionedAssignments) {
		yield;
		paragraph.style.cssText = 'position:relative;height:0;margin:0;padding:0;line-height:0';
		const x = layout.x, naturalWidth = Number(image.getAttribute('width')) || 0;
		if (layout.lines != null) { image.style.width = 'auto'; image.style.height = globalThis.RapierMarkdownLayout.linesHeightCss(layout.lines); }
		else if (layout.width != null) image.style.width = layout.width + '%';
		else if (naturalWidth > 0) image.style.width = naturalWidth + 'px';
		image.style.left = x == null ? '0' : layout.width != null ? Math.max(0, Math.min(100 - layout.width, x - layout.width / 2)) + '%'
			: naturalWidth > 0 ? 'calc(' + x + '% - ' + (naturalWidth / 2) + 'px)' : x + '%';
		image.style.position = 'absolute';
		image.style.top = (layout.y || 0) + 'em';
		image.style.margin = '0';
		if (layout.rotate) { image.style.transform = 'rotate(' + layout.rotate + 'deg)'; image.style.transformOrigin = '50% 50%'; }
		if (layout.wrap === 'behind') image.style.zIndex = '-1';
		paragraph.classList.add('rapier-positioned-picture');
		if (owner && owner !== paragraph.nextElementSibling) owner.before(paragraph);
	}
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
			const width = layout.width != null && !layout.lines ? layout.width : naturalWidth, height = layout.width != null && !layout.lines ? layout.width * naturalHeight / naturalWidth : naturalHeight;
			const unit = layout.width != null && !layout.lines ? '%' : 'px';
			const boundWidth = width * Math.abs(Math.cos(rad)) + height * Math.abs(Math.sin(rad));
			const boundHeight = width * Math.abs(Math.sin(rad)) + height * Math.abs(Math.cos(rad));
			image.style.display = 'block';
			image.style.marginLeft = image.style.marginRight = ((boundWidth - width) / 2) + unit;
			image.style.marginTop = image.style.marginBottom = ((boundHeight - height) / 2) + unit;
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
	for (const [index, image] of [...root.querySelectorAll('img,[data-rapier-remote-src],image,source[srcset]')].entries()) {
		const tag = image.tagName.toLowerCase();
		const src = image.getAttribute('data-rapier-remote-src') ?? image.getAttribute(tag === 'image' ? 'href' : 'src') ?? image.getAttribute('xlink:href') ?? '';
		const srcset = image.getAttribute('srcset') || '';
		const sources = [];
		const picture = image.parentElement?.tagName.toLowerCase() === 'picture' && image.parentElement;
		const alternative = picture && [...picture.querySelectorAll('source[srcset]')].some(source => source.getAttribute('srcset').trim());
		if (tag !== 'source' && (src || !srcset && !alternative)) sources.push(src);
		for (let at = 0; at < srcset.length;) {
			while (at < srcset.length && /[\t\n\f\r ,]/.test(srcset[at])) at++;
			const start = at;
			while (at < srcset.length && !/[\t\n\f\r ]/.test(srcset[at])) at++;
			const candidate = srcset.slice(start, at);
			if (!candidate) break;
			sources.push(candidate.replace(/,+$/, ''));
			if (candidate.endsWith(',')) continue;
			while (at < srcset.length && srcset[at++] !== ',') {}
		}
		const alt = image.getAttribute('data-rapier-remote-alt') ?? image.getAttribute('alt') ?? '';
		for (const source of new Set(sources)) {
			if (globalThis.RapierImageAssets.dataImage(source)) continue;
			const destination = /^data:/i.test(source) ? '(unsupported embedded image)' : source || '(missing image source)';
			missing.push('Picture ' + (index + 1) + (alt ? ' — ' + alt : '') + ': ' + destination);
		}
	}
	const sourceTags = new Set(['audio', 'video', 'source', 'track', 'input', 'iframe', 'embed', 'script']);
	const cssAttributes = new Set(['style', 'fill', 'stroke', 'filter', 'clip-path', 'mask', 'marker-start', 'marker-mid', 'marker-end', 'cursor', 'color-profile']);
	for (const element of root.querySelectorAll('*')) {
		const tag = String(element.localName || element.tagName || '').toLowerCase();
		if (sourceTags.has(tag)) requireResource(element.getAttribute('src'), tag + ' source');
		for (const attribute of ['poster', 'background']) requireResource(element.getAttribute(attribute), tag + ' ' + attribute);
		if (tag === 'object') requireResource(element.getAttribute('data'), 'object source');
		if (tag === 'link' || element.namespaceURI === 'http://www.w3.org/2000/svg' && tag !== 'a')
			for (const attribute of ['href', 'xlink:href']) requireResource(element.getAttribute(attribute), tag + ' ' + attribute);
		for (const attribute of element.attributes || []) if (cssAttributes.has(attribute.name.toLowerCase())) {
			const urls = _rapierCssValueUrls(attribute.value);
			if (urls === null) missing.push(tag + ' ' + attribute.name + ': (unresolved CSS resource)');
			else for (const url of urls) requireResource(url, tag + ' ' + attribute.name);
		}
	}
	if (!missing.length) return;
	throw Object.assign(new Error('Web page not written; embed these pictures and try again. ' + missing.join('; ')),
		{code: 'offline_image_unavailable'});
}

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
	const artifact = await _rapierBuildArtifact({kind: 'standalone'}, context);
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
	const html = htmlImageRecord(source); if (html) return [html];
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
			if (token.meta?.typography && token.nesting === 1) {
				stack.push({open: token.meta.typography.open, close: token.meta.typography.close}); continue;
			}
			if (token.meta?.typography && token.nesting === -1) { stack.pop(); continue; }
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

function _rapierProjectArtifactLayout(root, metadata, geometry, preparation) {
  if (!root || !metadata || !geometry || !preparation) return null;
  const doc = root.ownerDocument, view = doc.defaultView;
  const styles = new Map(), originals = new Map(), spacers = [], floats = [], steps = [], profiles = new WeakMap();
  const prepared = preparation.createPreparationScope(doc);
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

  function prepare(paragraph) {
    const refuse = () => { prepared.forget(paragraph); return null; };
    if (!/^(P|H[1-6])$/.test(paragraph.tagName) || !paragraph.textContent.trim() || paragraph.textContent.length > 8192 ||
        [...paragraph.querySelectorAll('[id]')].some(element => /^[\s\u00ad\u200b]*$/u.test(element.textContent)) ||
        paragraph.querySelector('img,svg,math,br,input,button,iframe,canvas,.math-rendered')) return refuse();
    const computed = css(paragraph);
    const language = paragraph.closest('[lang]')?.getAttribute('lang') || '';
    for (let parent = paragraph; parent; parent = parent.parentElement) {
      const inherited = css(parent);
      if (parent.style.textWrapStyle === 'pretty' || inherited.transform !== 'none' ||
          !['1', 'normal'].includes(inherited.zoom)) return refuse();
    }
    if (computed.textAlign === 'justify' || computed.textWrapStyle === 'balance' ||
        !preparation.supportsRichStyle(computed, language) || computed.whiteSpace !== 'normal' ||
        computed.transform !== 'none' ||
        ['::before', '::after'].some(pseudo => !['none', 'normal'].includes(view.getComputedStyle(paragraph, pseudo).content)) ||
        ['paddingLeft', 'paddingRight', 'paddingTop', 'borderLeftWidth', 'borderRightWidth', 'borderTopWidth']
          .some(key => parseFloat(computed[key]) > 0)) return refuse();
    const runs = [], items = [], walker = doc.createTreeWalker(paragraph, 4);
    for (let node; (node = walker.nextNode());) {
      if (runs.length === 192) return refuse();
      const parents = [];
      for (let parent = node.parentElement; parent !== paragraph; parent = parent.parentElement) {
        if (!parent || !/^(A|SPAN|EM|I|STRONG|B|DEL|S|MARK|CODE|KBD|SAMP|U|INS|ABBR|SUP|SUB)$/.test(parent.tagName) ||
            parent.hidden || parent.getAttribute('aria-hidden') === 'true' ||
            parent.style.textWrapStyle === 'pretty' ||
            parent.hasAttribute('lang') && parent.getAttribute('lang').toLowerCase() !== (language || '').toLowerCase()) return refuse();
        const parentStyle = css(parent);
        if (!preparation.supportsRichStyle(parentStyle, language) || parentStyle.display !== 'inline' ||
            parentStyle.cssFloat !== 'none' || !['static', 'relative'].includes(parentStyle.position) ||
            parentStyle.transform !== 'none' || !['1', 'normal'].includes(parentStyle.zoom) ||
            ['::before', '::after'].some(pseudo => !['none', 'normal'].includes(view.getComputedStyle(parent, pseudo).content))) return refuse();
        if (!/^(CODE|KBD|SAMP)$/.test(parent.tagName) &&
            ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth', 'marginLeft', 'marginRight']
              .some(key => Math.abs(parseFloat(parentStyle[key]) || 0) > .01)) return refuse();
        parents.unshift(parent);
      }
      const computedRun = css(node.parentElement);
      if (!preparation.supportsRichStyle(computedRun, language) ||
          computedRun.whiteSpace !== computed.whiteSpace && computedRun.whiteSpace !== 'nowrap') return refuse();
      const font = `${computedRun.fontStyle} ${computedRun.fontWeight} ${computedRun.fontSize} ${computedRun.fontFamily}`;
      const letterSpacing = parseFloat(computedRun.letterSpacing) || 0;
      const boxed = parents.some(parent => /^(CODE|KBD|SAMP)$/.test(parent.tagName));
      if (boxed && (!/^(CODE|KBD|SAMP)$/.test(node.parentElement.tagName) || node.parentElement.childNodes.length !== 1)) return refuse();
      const extraWidth = boxed ? ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth', 'marginLeft', 'marginRight']
        .reduce((width, key) => width + (parseFloat(computedRun[key]) || 0), 0) : 0;
      runs.push({parents, raw: node.data, font, letterSpacing,
        directions: parents.map(parent => parent.getAttribute('dir') === 'auto' ? css(parent).direction : null)});
      items.push({text: node.data, font, letterSpacing,
        break: computedRun.whiteSpace === 'nowrap' || parents.some(parent => parent.hasAttribute('data-rapier-source')) ? 'never' : 'normal', extraWidth});
    }
    if (!runs.length) return refuse();
    const options = {whiteSpace: computed.whiteSpace, wordBreak: computed.wordBreak, language};
    const flow = prepared.prepare(paragraph, items, options);
    if (!flow) return refuse();
    const fontSize = parseFloat(computed.fontSize) || 16;
    return {paragraph, runs, flow, whiteSpace: computed.whiteSpace, direction: computed.direction,
      align: computed.textAlign, fontSize, lineHeight: parseFloat(computed.lineHeight) || fontSize * 1.65,
      balance: 0};
  }

  let inkIds = 0;
  function fragmentNode(record, fragment, idsKept) {
    const run = record.runs[fragment.itemIndex], mapped = geometry.mapFragment(run, fragment, {whiteSpace: record.whiteSpace});
    if (!mapped) return null;
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
    if (!prepared.current(record.flow)) return false;
    const plan = geometry.flowLines(record.flow, width, top, obstacles, record.lineHeight,
      metadata.wrapColumnFloor(record.fontSize), record.direction, record.balance, record.align);
    if (!plan) return false;
    const output = doc.createDocumentFragment();
    const idsKept = new Set();
    for (const run of record.runs) for (const parent of run.parents)
      if (parent.matches?.('span.rapier-ink-mark[data-rapier-ink]') && !parent.hasAttribute('data-rapier-ink-id')) parent.setAttribute('data-rapier-ink-id', String(++inkIds));
    let previous = null;
    for (const line of plan.lines) {
      const element = doc.createElement('span');
      element.style.cssText = `display:block;position:absolute;left:${pixels(line.x)};top:${pixels(line.y)};width:${pixels(line.width)};height:${pixels(record.lineHeight)};white-space:pre;direction:${record.direction}`;
      element.style.textAlign = ['left', 'center', 'right', 'start', 'end'].includes(record.align)
        ? record.align : record.direction === 'rtl' ? 'right' : 'left';
      for (const fragment of line.fragments) {
        const child = fragmentNode(record, fragment, idsKept);
        if (!child) return false;
        if (hasGap(record, previous, fragment)) {
          const gap = doc.createElement('span');
          const gapRun = record.runs[fragment.gapItemIndex];
          if (!gapRun && fragment.gapBefore !== 0) return false;
          gap.style.cssText = 'display:inline-block;width:' + pixels(fragment.gapBefore);
          if (gapRun) { gap.style.font = gapRun.font; gap.style.letterSpacing = pixels(gapRun.letterSpacing); }
          gap.textContent = ' '; element.append(gap);
        }
        element.append(child); previous = fragment;
      }
      output.append(element);
    }
    if (!prepared.current(record.flow)) return false;
    originals.set(record.paragraph, [...record.paragraph.childNodes]);
    record.paragraph.replaceChildren(output);
    style(record.paragraph, {position: 'relative', height: pixels(plan.height), 'min-height': '0'});
    return true;
  }

  function hasGap(record, previous, current) {
    if (!previous) return false;
    let found = false;
    for (let index = previous.itemIndex; index <= current.itemIndex; index++) {
      const run = record.runs[index];
      if (!run) return false;
      const start = index === previous.itemIndex ? previous.sourceEnd : 0;
      const end = index === current.itemIndex ? current.sourceStart : run.raw.length;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > run.raw.length) return false;
      const gap = run.raw.slice(start, end);
      if (gap && !/^[ \t\n\r\f]+$/.test(gap)) return false;
      found ||= !!gap;
    }
    return found;
  }

  function profile(image, layout) {
    if (layout.wrap === 'around' && image.dataset?.rapierContour?.endsWith('-box')) return null;
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

  function boxProfile(image) {
    const raw = image.getAttribute('data-rapier-box-polygon');
    if (!raw) return null;
    const numbers = raw.trim().split(/\s+/).map(Number);
    if (numbers.length < 6 || numbers.length % 2 || numbers.some(value => !Number.isFinite(value))) return null;
    const corners = [];
    for (let index = 0; index < numbers.length; index += 2) corners.push([numbers[index], numbers[index + 1]]);
    return geometry.polygonProfile(corners);
  }

  function syncInlineRotatedPictures(exclude) {
    for (const image of root.querySelectorAll('img[data-rapier-image-layout]')) {
      if (exclude.has(image) || !image.complete || !image.naturalWidth || !image.naturalHeight) continue;
      const layout = metadata.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
      if (!layout?.rotate || ['around', 'box', 'behind', 'front'].includes(layout.wrap)) continue;
      const width = image.offsetWidth, height = image.offsetHeight;
      if (!(width > 0 && height > 0)) continue;
      const paragraph = image.closest('p');
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
    if (element.tagName === 'P' && !element.textContent.trim() && !image) return 'metadata';
    return null;
  }

  const FLOAT_BLOCK = /^(P|H[1-6]|UL|OL|BLOCKQUOTE|DETAILS|SUMMARY|DL)$/;
  function floatAround(element, width, height, top, obstacles) {
    if (!FLOAT_BLOCK.test(element.tagName) || !/^(P|H[1-6])$/.test(element.tagName) && element.querySelector('table, pre, figure, img, .math-rendered')) return false;
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
      float.className = 'rapier-flow-float';
      float.setAttribute('aria-hidden', 'true');
      float.style.cssText = `float:${side};width:${pixels(shape.boxWidth)};height:${pixels(shape.boxHeight)};margin-top:${pixels(shape.startY)};shape-outside:${shape.shape};pointer-events:none`;
      element.prepend(float); floats.push(float); placed.push([float, shape]);
    }
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
      const children = [...root.children].filter(element => !element.hasAttribute('data-rapier-html-preview'));
      if (children.length > 8192) return;
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
      syncInlineRotatedPictures(positionedImages);
      for (const element of children) {
        if (wrapped.has(element)) continue;
        const bounds = box(element);
        if (!bounds.width || !bounds.height) continue;
        const computed = css(element), inset = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.borderLeftWidth) || 0);
        const width = bounds.width - inset - (parseFloat(computed.paddingRight) || 0) - (parseFloat(computed.borderRightWidth) || 0);

        for (const {element: source, image, layout, width: imageWidth} of anchors.get(element) || []) {
          const lines = layout.lines != null ? geometry.lineMetrics(element) : null;
          const unrotated = geometry.imageBox(width, image.naturalWidth, image.naturalHeight, layout, imageWidth, lines);
          if (!unrotated) { restore(); return; }
          if (image.hasAttribute('data-rapier-html')) {
            const attrs = JSON.parse(decodeURIComponent(image.getAttribute('data-rapier-html'))).attrs;
            const line = parseFloat(computed.lineHeight) || (parseFloat(computed.fontSize) || 16) * 1.6;
            unrotated.height = metadata.objectHeight(unrotated.width, Number(image.dataset.rapierNaturalHeight) || box(image).height, attrs, line);
          }
          const rasterRad = (layout.rotate || 0) * Math.PI / 180;
          const fit = geometry.rasterReserved(width, unrotated, rasterRad);
          if (!fit) { restore(); return; }
          const rectangle = fit.reserved, visualDeltaX = fit.visualDeltaX, visualDeltaY = fit.visualDeltaY;
          const left = bounds.left + inset + rectangle.x;
          const em = parseFloat(computed.fontSize) || 16;
          const topInset = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.borderTopWidth) || 0);
          const height = Math.max(0, bounds.height - topInset - (parseFloat(computed.paddingBottom) || 0) - (parseFloat(computed.borderBottomWidth) || 0));
          let y = bounds.top - origin + topInset + geometry.linesTop(layout, lines) + Math.min(layout.y || 0, height / em) * em;
          const scale = geometry.frameScale(image), room = 10 * scale;
          if (!outOfFlow(layout)) {
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
  function fontChanged() { prepared.invalidateFonts(); schedule(); }

  const observer = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(() => {
    const width = root.clientWidth;
    if (width !== lastWidth) { lastWidth = width; schedule(); }
  }) : null;
  observer?.observe(root);
  root.addEventListener('load', schedule, true);
  root.addEventListener('error', schedule, true);
  root.addEventListener('rapier-html-resize', schedule);
  root.addEventListener('toggle', schedule, true);
  view.addEventListener('resize', schedule);
  view.addEventListener('pageshow', schedule);
  view.addEventListener('beforeprint', beforePrint);
  view.addEventListener('afterprint', afterPrint);
  for (const event of ['loading', 'loadingdone', 'loadingerror']) doc.fonts?.addEventListener?.(event, fontChanged);
  Promise.resolve(doc.fonts?.ready).then(schedule, schedule);
  schedule();
  return Object.freeze({reflow, destroy({documentChanged = false} = {}) {
    stopped = true;
    if (scheduled) view.cancelAnimationFrame(scheduled);
    observer?.disconnect(); restore(); prepared.retire({documentChanged});
    root.removeEventListener('load', schedule, true);
    root.removeEventListener('error', schedule, true);
    root.removeEventListener('rapier-html-resize', schedule);
    root.removeEventListener('toggle', schedule, true);
    view.removeEventListener('resize', schedule);
    view.removeEventListener('pageshow', schedule);
    view.removeEventListener('beforeprint', beforePrint);
    view.removeEventListener('afterprint', afterPrint);
    for (const event of ['loading', 'loadingdone', 'loadingerror']) doc.fonts?.removeEventListener?.(event, fontChanged);
  }});
}

function _rapierArtifactLayoutScript(root, nonce = '', {pictures = true} = {}) {
  const dependencies = globalThis.RapierArtifactLayoutDependencies;
  const layoutOf = element => globalThis.RapierMarkdownLayout.parseLayoutAttribute(element.getAttribute('data-md-layout'));
  const pictureLayoutOf = image => globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'));
  const wrapping = pictures && ([...root.querySelectorAll('p[data-md-layout]')].some(element => ['around', 'box', 'behind', 'front'].includes(layoutOf(element)?.wrap)) ||
       [...root.querySelectorAll('img[data-rapier-image-layout]')].some(image => pictureLayoutOf(image)?.rotate));
  const typography = _rapierArtifactTypographyScript(root);
  if (!wrapping && !typography) return '';
  if (!dependencies?.factories || typography && !dependencies.factories['layout/typography.mjs'])
    throw new Error('Offline typography requires the complete retained MIT layout factories');
  const modules = _rapierArtifactFactoryModules(dependencies, 'layout');
  const script = '/* Rapier export layout: SPDX-License-Identifier: MIT */\n' +
    '/* Pretext 1.0.0 + main 0d102a5cd933611e86a7e60bda7b4baa5995c6b0\n' + dependencies.license + '\n*/\n' +
    '(() => {\nconst modules = Object.create(null);\n' + modules +
    (wrapping ? '\n(' + _rapierProjectArtifactLayout.toString() +
    ')(document.querySelector("main.rapier-page"), modules["spec/md-layout.mjs"], modules["layout/model.mjs"], modules["layout/preparation.mjs"]);\n' : '') +
    typography + '\n})();';

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

function _rapierArtifactTypographyScript(root) {
  const pictures = root.querySelector('img[data-rapier-print-lines]');
  if (!pictures && !root.querySelector('p[data-md-hyphens="auto"],p[data-md-lines],p[data-md-caps="small"],p[data-md-hanging="on"]')) return '';
  return '(() => {\nconst typography = modules["layout/typography.mjs"].createTypography();\n' +
    (pictures ? 'const capitals = (' + createPrintCapitals.toString() + ')((' + createLineMeasurer.toString() + ')(),(' + linesHeight.toString() + '),(' + followingPrintProse.toString() + '));\n' : '') +
    'const root = document.querySelector("main.rapier-page"); const printMedia = matchMedia("print"); let frame = 0, width = -1, ready = null, printing = printMedia.matches;\n' +
    'const apply = () => { cancelAnimationFrame(frame); frame = 0; ' + (pictures ? 'if (printing) capitals.apply(root); else capitals.clear(root); ' : '') + 'if (printing && !(parseFloat(getComputedStyle(root).getPropertyValue("--rapier-print-width")) > 0)) { typography.clear(root); ready?.(); ready = null; return; } if (typography.apply(root, {all:printing}).pending) schedule(); else { ready?.(); ready = null; } };\n' +
    'const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };\n' +
    'globalThis.__RAPIER_EXPORT_READY__ = Promise.all([document.fonts?.ready, ...Array.from(root.querySelectorAll("img"), image => image.decode?.().catch(() => {}))]).then(() => new Promise(resolve => { ready = resolve; schedule(); }));\n' +
    'printMedia.addEventListener("change", () => { printing = printMedia.matches; schedule(); });\n' +
    'addEventListener("resize", schedule); addEventListener("beforeprint", () => { printing = true; apply(); });\n' +
    'addEventListener("scroll", schedule, {passive:true, capture:true});\n' +
    'for (const event of ["copy","cut"]) addEventListener(event, () => { if (typography.clearSelection(root)) schedule(); }, true);\n' +
    'addEventListener("afterprint", () => { printing = printMedia.matches; ' + (pictures ? 'capitals.clear(root); ' : '') + 'schedule(); });\n' +
    'root.addEventListener("load", schedule, true);\n' +
    'for (const event of ["loading","loadingdone","loadingerror"]) document.fonts?.addEventListener(event, () => { typography.invalidateFonts(document); schedule(); });\n' +
    'addEventListener("pagehide", () => { cancelAnimationFrame(frame); frame = 0; typography.retire(root); }); addEventListener("pageshow", schedule);\n' +
    'if (typeof ResizeObserver === "function") new ResizeObserver(() => { const next = root.getBoundingClientRect().width; if (next !== width) { width = next; schedule(); } }).observe(root);\n' +
    '})();';
}

  return {_rapierDataImageDestinationsAsync, _rapierSharedSourceFormsAsync, _rapierPrefixPortableAnchorsSteps, _rapierPortableAnchorId, _rapierProjectStyledRootAsync, _rapierBuildArtifact, _rapierBuildPublishedPage, _rapierProjectStyledRoot, _rapierDocxRenderStyles, _rapierPaintCode, _rapierPrefixPortableAnchors, _rapierDocumentSettingsOf, _rapierDocumentSettingsCss, _rapierExportedPageCsp, _rapierArtifactNonce, _rapierAnnotateExportBoxPolygons, _rapierSharedSourceHash, _rapierSharedSourceForms, _rapierSharedSourceCarrier, _rapierSharedResolve, _rapierReadSharedDocument, _rapierSharedPageFallbackCss, _rapierShareWrapKind, _rapierSharePictureParagraph, _rapierSharedPageLayout, _rapierShareCapLongCodeBlocks, _rapierRequireOfflinePageImages, _rapierCssValueUrls, _rapierBuildSharedPage, _rapierImageSources, _rapierImageDestinations, _rapierScanMarkdownImages, _rapierParseMarkdownImageDestination, _rapierImageOpenRunsList, _rapierArtifactFactoryModules, _rapierProjectArtifactLayout, _rapierArtifactLayoutScript, _rapierArtifactInkScript , render};
}
export {createRenderer};
