// SPDX-License-Identifier: MIT
import {htmlPlaceholder, mountHtmlBlocks, materializeObjects, objectPosterLabel, htmlImageRecord, htmlLayoutEdit, htmlModeEdit, mergeHtmlObjectBlocks} from '../spec/html-blocks.mjs';
import {finish, finishAsync, cloneTree, cleanTree, serializeTree, htmlParts, admitHtml, htmlBoundary, pause, check} from './render-work.mjs';
import {installWikiParser, wikiAddress} from './wiki.mjs';
const RAPIER_TABLE_CAPTION_PREFIX_RE = /^(?:Table:|:) /;
const RAPIER_PORTABLE_HIGHLIGHT_HEX = Object.freeze({
	green: '#35c57a', red: '#f05a62', blue: '#4f91f7', yellow: '#e6b91e', purple: '#9b6dea',
});
const _RAPIER_RTL_SCRIPT = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Phoenician}\p{Script=Imperial_Aramaic}\p{Script=Palmyrene}\p{Script=Nabataean}\p{Script=Hatran}\p{Script=Old_South_Arabian}\p{Script=Old_North_Arabian}\p{Script=Mende_Kikakui}\p{Script=Old_Hungarian}\p{Script=Old_Sogdian}\p{Script=Sogdian}\p{Script=Elymaic}\p{Script=Chorasmian}\p{Script=Yezidi}\p{Script=Old_Uyghur}\p{Script=Hanifi_Rohingya}]/u;
function createMarkdownRenderer(runtime) {
  const {Node, _rapierPrefixPortableAnchors, RAPIER_HIGHLIGHT_COLOR_BY_MARKER, RAPIER_MARKDOWN_SPEC, RAPIER_RENDERED_HEADING_SELECTOR, _rapierApplyMarkdownSpec, _rapierChromeOwnsId, _rapierCodeHtml, _rapierDeriveDarkColor, _rapierDormantHeadings, _rapierEmbedAssetSource, _rapierHeadingSlugBase, _rapierNextHeadingSlug, _rapierHighlightAdmitted, _rapierInstallMarkdownMath, _rapierMarkdownPreview, _rapierPlainLayout, _rapierProviders, _rapierRemoteContent, _rapierRemoteImagePlaceholder, _rapierRemoteSubresourceOrigin, _rapierRenderedAnchorOriginalIds, _rapierSourceCharEscaped, _rapierSplitOpeningFrontmatter, _rapierUiDiagram, _rapierUiMath, document, escapeRapierHtmlText, globalThis, sanitizeRapierHtml, window} = runtime;
  let md = runtime.md;
  let wikiTimer = null, wikiAttempt = 0;
  const wikiBusy = new WeakSet();
  function scheduleWikiEmbeds() {
    if (!globalThis.RapierPlatform || !document || wikiTimer !== null) return;
    wikiTimer = setTimeout(async () => {
      wikiTimer = null;
      const original = globalThis.RapierOriginalFolderCore?.currentOriginal();
      if (!original) { if (++wikiAttempt < 8) scheduleWikiEmbeds(); return; }
      wikiAttempt = 0;
      for (const node of [...document.querySelectorAll('#editor-blocks .rapier-source-token--wiki-embed')].slice(0, 32)) {
        if (wikiBusy.has(node) || node.hasAttribute('data-rapier-wiki-ready')) continue;
        wikiBusy.add(node);
        try {
          const link = node.querySelector('a'), href = link?.getAttribute('href');
          if (!href) continue;
          const before = node.innerHTML;
          const embedded = await original.embed(href);
          if (!node.isConnected || node.innerHTML !== before || globalThis.RapierOriginalFolderCore?.currentOriginal() !== original) continue;
          const holder = _rapierRenderSemanticRoot(embedded.text, {docKind: 'markdown'}, {wikiEmbedding: true});
          let followed = 0;
          for (const anchor of holder.querySelectorAll('a[href]')) {
            const address = anchor.getAttribute('href');
            if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(address)) continue;
            try {
              if (++followed > 64) throw new Error('link limit');
              anchor.setAttribute('href', await original.addressFrom(embedded.displayPath, address));
            } catch (_) { anchor.replaceWith(...anchor.childNodes); }
          }
          if (!node.isConnected || node.innerHTML !== before || globalThis.RapierOriginalFolderCore?.currentOriginal() !== original) continue;
          for (const image of holder.querySelectorAll('img,[data-rapier-remote-src]'))
            image.replaceWith(document.createTextNode(image.getAttribute('alt') || image.textContent || ''));
          for (const block of [...holder.querySelectorAll('p,h1,h2,h3,h4,h5,h6,div,pre,blockquote,ul,ol,li,table,tr,td,th')].reverse())
            block.replaceWith(...block.childNodes, document.createElement('br'));
          node.replaceChildren(...holder.childNodes);
          node.setAttribute('data-rapier-visible', encodeURIComponent(node.textContent));
          node.setAttribute('data-rapier-wiki-ready', '');
          node.contentEditable = 'false';
        } catch (_) {  }
        finally { wikiBusy.delete(node); }
      }
    }, 125);
  }
  window?.addEventListener?.('rapier:original-file-ready', scheduleWikiEmbeds);
  const wikiMode = options => options.wikiEmbedding ? 'links' : options.wikiLinks !== undefined ? options.wikiLinks
    : globalThis.RapierOriginalFolderCore?.currentOriginal?.() ? 'label' : false;
let codeLeft = Infinity;
function initMarkdownIt() {
	if (typeof window.markdownit !== 'function') throw new Error('markdownit');
	if (typeof _rapierMarkdownPreview === 'function') globalThis.rapierRenderPreview = _rapierMarkdownPreview;

	md = window.markdownit({
		...RAPIER_MARKDOWN_SPEC.options,
		highlight: (code, lang) => lang && _rapierHighlightAdmitted(code) && (codeLeft -= code.length) >= 0 ? _rapierCodeHtml(code, lang) : '',
	});

	_rapierApplyMarkdownSpec(md, window);
	globalThis.RapierImageAssets.installMarkdownImages(md);
	_rapierInstallSemanticProbe(md);
	md.core.ruler.after('block', 'rapier_part_decorations', state => {
		if (state.env.rapierPartDecorations && !/[<$\\]/.test(state.src) && !state.src.includes('^['))
			state.tokens = _rapierPartDecorationGroups(state.tokens).flat();
	});
	_rapierInstallMarkdownMath(md, RAPIER_MARKDOWN_SPEC.rules.mathBlock);

	const markOpenDefault = md.renderer.rules.mark_open ||
		((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
	md.renderer.rules.mark_open = (tokens, idx, opts, env, self) => {
		const token = tokens[idx];
		const first = tokens[idx + 1];
		if (first && first.type === 'text') {
			for (const [marker, color] of Object.entries(RAPIER_HIGHLIGHT_COLOR_BY_MARKER)) {
				if (!first.content.startsWith(marker)) continue;
				let hasContent = first.content.length > marker.length;
				let depth = 1;
				for (let cursor = idx + 2; !hasContent && cursor < tokens.length; cursor++) {
					const candidate = tokens[cursor];
					if (candidate.type === 'mark_open') depth++;
					else if (candidate.type === 'mark_close' && --depth === 0) break;
					else if (depth > 0 && String(candidate.content || '').length) hasContent = true;
				}
				if (!hasContent) break;
				first.content = first.content.slice(marker.length);
				token.attrSet('data-rapier-highlight', color);
				break;
			}
		}
		return markOpenDefault(tokens, idx, opts, env, self);
	};

	const renderTypography = (tokens, index) => {
		const typed = globalThis.RapierMarkdownSpec.typography, held = tokens[index].meta?.typography;
		if (!held) return '<span>';
		const facts = held.style, attrs = [], css = [];
		if (facts.size) {
			attrs.push('data-md-size="' + facts.size + '"');
			css.push('font-size:calc(' + typed.size(facts.size).points / 12 + ' * var(--md-unit))');
		}
		if (facts.color) {
			attrs.push('data-md-color="' + facts.color + '"');
			css.push('--md-color:' + facts.color, '--md-color-dark:' + _rapierDeriveDarkColor(facts.color));
		}
		if (facts.family) {
			attrs.push('data-md-font="' + md.utils.escapeHtml(facts.family.name) + '"');
			css.push('font-family:' + facts.family.css);
		}
		attrs.push('data-md-typography-open="' + md.utils.escapeHtml(encodeURIComponent(held.open)) + '"',
			'data-md-typography-close="' + md.utils.escapeHtml(encodeURIComponent(held.close)) + '"');
		return '<span ' + attrs.join(' ') + ' style="' + md.utils.escapeHtml(css.join(';')) + '">';
	};
	md.renderer.rules.rapier_typography_open = renderTypography;
	md.renderer.rules.rapier_typography_close = () => '</span>';
	md.renderer.rules.rapier_ink_open = (tokens, idx) => {
		const body = String(tokens[idx].attrGet('data-rapier-ink') || '');
		const spec = globalThis.RapierMarkdownSpec;
		const mark = spec && typeof spec.parseInkBody === 'function' ? spec.parseInkBody(body) : null;
		return '<span class="rapier-ink-mark" data-rapier-ink="' + md.utils.escapeHtml(body) + '"'
			+ (mark ? ' data-rapier-ink-dark="' + _rapierDeriveDarkColor(mark.hex || '#b32034') + '"' : '') + '>';
	};
	md.renderer.rules.rapier_ink_close = () => '</span>';

	const sourceToken = (source, visible, className) =>
		'<span class="rapier-source-token ' + className + '" data-rapier-source="' +
		encodeURIComponent(source) + '" data-rapier-visible="' + encodeURIComponent(visible) + '">' + md.utils.escapeHtml(visible) + '</span>';
	installWikiParser(md, (token, env) => {
		const {target, label, embed} = token.meta, href = wikiAddress(target), esc = md.utils.escapeHtml;
		if (env.rapierWikiLinks === 'label') return esc(label);
		if (embed && /\.(?:png|jpe?g|gif|webp|jxl)(?:#.*)?$/i.test(target)) {
			if (!env.rapierWikiEmbedding && globalThis.RapierPlatform?.files.relativeCandidate?.(href) && globalThis.RapierEmbeddedImages?.imageHtml)
				return globalThis.RapierEmbeddedImages.imageHtml(null, label, '', null, '', label, token.content, href, env.rapierImagePresentation !== false);
			return '<span data-rapier-remote-src="' + esc(href) + '" data-rapier-remote-alt="' + esc(label) +
				'" data-rapier-image-source="' + esc(encodeURIComponent(token.content)) + '">' + esc(label) + '</span>';
		}
		const note = embed && !env.rapierWikiEmbedding;
		if (note && !env.rapierPassive) scheduleWikiEmbeds();
		return '<span class="rapier-source-token rapier-source-token--wiki' + (note ? '-embed' : '') +
			'" data-rapier-source="' + esc(encodeURIComponent(token.content)) + '" data-rapier-visible="' + esc(encodeURIComponent(label)) +
			'"><a href="' + esc(href) + '">' + esc(label) + '</a></span>';
	});
	md.renderer.rules.emoji = (tokens, idx) => {
		const token = tokens[idx];
		const source = token.markup ? ':' + token.markup + ':' : token.content;
		return sourceToken(source, token.content, 'rapier-source-token--emoji');
	};
	md.renderer.rules.softbreak = () =>
		sourceToken('\n', '\u2060', 'rapier-source-token--softbreak');
	md.core.ruler.before('text_join', 'rapier_escape_token', state => {
		for (let at = 0; at < state.tokens.length; at++) {
			const token = state.tokens[at];
			if (token.type !== 'inline' || !token.children) continue;
			for (let next = 0; next < token.children.length; next++) {
				const child = token.children[next];
				if (child.type === 'text_special' && child.info === 'escape' && child.content.length === 1 && !/[\\*`[\]_]/.test(child.content)) child.type = 'rapier_escape';
			}
		}
	});
	md.renderer.rules.rapier_escape = (tokens, idx) =>
		sourceToken('\\' + tokens[idx].content, tokens[idx].content, 'rapier-source-token--escape');

	const linkOpenDefault = md.renderer.rules.link_open ||
		((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
	md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
		const token = tokens[idx];
		if (token.info === 'auto' && /^(?:linkify|autolink)$/.test(token.markup || '')) {
			token.attrSet('data-rapier-auto-link', token.markup);
		}
		return linkOpenDefault(tokens, idx, opts, env, self);
	};

	md.renderer.rules.image = (tokens, idx, opts, env, self) => {
		const token = tokens[idx];
		const written = token.attrGet('src') || '';
		const hosted = globalThis.RapierEmbedPictureBase?.(written) ?? null;
		const src = hosted || written;
		const title = token.attrGet('title') || '';
		const rawAlt = String(token.content ?? token.attrGet('alt') ?? '');
		const size = _rapierImageAltSize(rawAlt);
		const semanticAlt = token.children ? self.renderInlineAsText(token.children, opts, env) : _rapierImageAltText(rawAlt, env);
		const suffix = size ? rawAlt.slice(size.alt.length) : '';
		const alt = suffix && semanticAlt.endsWith(suffix) ? semanticAlt.slice(0, -suffix.length) : semanticAlt;
		const layout = token.meta?.mdLayout?.imageOnly ? token.meta.mdLayout.marker : '';
		const asset = globalThis.RapierImageAssets.dataImage(src), reference = token.meta?.mdImage?.reference;
		const originalRelative = globalThis.RapierPlatform?.files.relativeCandidate?.(src) || globalThis.RapierSiblingPictures?.has(src);
		if (!env.rapierPage && typeof globalThis.RapierEmbeddedImages?.imageHtml === 'function' &&
			(originalRelative || _rapierEmbedAssetSource?.(src) || asset && (reference || asset.codec === 'image/jxl' || asset.codec === 'image/gif' || asset.codec === 'image/svg+xml'))) return globalThis.RapierEmbeddedImages.imageHtml(
			originalRelative ? null : reference, alt, title, size, layout, rawAlt, token.meta?.mdImage?.source, src, env.rapierImagePresentation !== false);
		const drawingAlt = typeof rawAlt === 'string' && alt === '' && asset?.codec === 'image/svg+xml' ? globalThis.RapierImageAssets.drawingImageAlt(src) : null;
		const shownAlt = drawingAlt ?? alt;
		let loadable = false;
		try { loadable = !!src.trim() && /^(?:https?|file|blob|data):$/.test(new URL(src, globalThis.document?.baseURI || globalThis.location?.href || 'https://rapier.invalid/').protocol); } catch (_) {}
		if (!loadable) {
			const escape = md.utils.escapeHtml;
			return '<span data-rapier-markdown-image="" data-rapier-remote-src="' + escape(src) + '" data-rapier-remote-alt="' + escape(alt) + '"'
				+ (title ? ' data-rapier-remote-title="' + escape(title) + '"' : '')
				+ (size ? ' data-rapier-image-alt-source="' + escape(rawAlt) + '"' : '')
				+ (layout ? ' data-rapier-image-layout="' + escape(encodeURIComponent(layout)) + '"' : '')
				+ (token.meta?.mdImage?.source ? ' data-rapier-image-source="' + escape(encodeURIComponent(token.meta.mdImage.source)) + '"' : '')
				+ '>' + escape(alt || src) + '</span>';
		}
		if (!hosted && !env.rapierPage && !_rapierRemoteContent.allowed && _rapierRemoteSubresourceOrigin(src)) {
			const html = _rapierRemoteImagePlaceholder(src, alt, title, size, layout, rawAlt);
			return html.replace('<span ', '<span data-rapier-markdown-image="" ' +
				(token.meta?.mdImage?.source ? 'data-rapier-image-source="' + md.utils.escapeHtml(encodeURIComponent(token.meta.mdImage.source)) + '" ' : ''));
		}
		let animation = null;
		try {animation = globalThis.RapierImageAssets.imageAnimation?.(src);} catch (_) {}
		const attrs = [
			'data-rapier-markdown-image=""',
			'src="' + md.utils.escapeHtml(animation?.first || src) + '"',
			'alt="' + md.utils.escapeHtml(shownAlt) + '"',
			'loading="lazy"',
			'decoding="async"',
		];
		if (animation) attrs.push('data-rapier-animation="' + md.utils.escapeHtml(src) + '"',
			'data-rapier-natural-width="' + animation.width + '"', 'data-rapier-natural-height="' + animation.height + '"');
		if (token.meta?.mdImage?.source && token.meta.mdImage.source.length <= 4096)
			attrs.push('data-rapier-image-source="' + md.utils.escapeHtml(encodeURIComponent(token.meta.mdImage.source)) + '"');
		if (title) attrs.push('title="' + md.utils.escapeHtml(title) + '"');
		if (shownAlt !== alt || size && !token.meta?.mdLayout?.layout?.width) attrs.push('data-rapier-image-alt-source="' + md.utils.escapeHtml(rawAlt) + '"');
		if (layout) attrs.push('data-rapier-image-layout="' + md.utils.escapeHtml(encodeURIComponent(layout)) + '"');
		if (env.rapierImagePresentation === false) return '<img ' + attrs.join(' ') + _rapierImageSizeAttributes(size, layout) + '>';
		const geometry = !env.rapierPage && globalThis.RapierEmbeddedImages?.geometry
			? globalThis.RapierEmbeddedImages.geometry(src) : globalThis.RapierImageAssets.imagePlaceholderDimensions(src);
		return '<img ' + attrs.join(' ') + _rapierImageSizeAttributes(size, layout, geometry || {}) + '>';
	};

	md.renderer.rules.hr = function (tokens, idx) {
		const m = (tokens[idx].markup || '---').charAt(0);
		const style = m === '*' ? 'stars' : (m === '_' ? 'underscore' : 'dash');
		return '<hr data-hr-style="' + style + '">\n';
	};

	md.renderer.rules.rapier_break = () =>
		'<div class="rapier-page-break" data-md-break="page" contenteditable="false" role="separator" aria-label="Page break"></div>\n';

	const inPage = typeof sanitizeRapierHtml === 'function' && typeof _rapierChromeOwnsId === 'function';
	const rawAttribute = /[\t\n\f\r ]+([A-Za-z_:][A-Za-z0-9_.:-]*)(?:[\t\n\f\r ]*=[\t\n\f\r ]*("[^"]*"|'[^']*'|[^"'=<>`\t\n\f\r ]+))?/g;
	const RAW_ID_NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", lowbar: '_', UnderBar: '_', num: '#', colon: ':',
		period: '.', sol: '/', excl: '!', quest: '?', commat: '@', plus: '+', ast: '*', percnt: '%', dollar: '$', semi: ';',
		equals: '=', comma: ',', lpar: '(', rpar: ')', lsqb: '[', lbrack: '[', rsqb: ']', rbrack: ']', lcub: '{', lbrace: '{',
		rcub: '}', rbrace: '}', verbar: '|', vert: '|', VerticalLine: '|', bsol: '\\', Hat: '^', grave: '`', DiacriticalGrave: '`', Tab: '\t', NewLine: '\n' };
	const attributeText = value => String(value || '').replace(/^["']|["']$/g, '')
		.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]{0,31}));?/g, (whole, dec, hex, name) => {
			const code = dec ? Number(dec) : hex ? parseInt(hex, 16) : -1;
			if (code >= 0) return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
			return Object.hasOwn(RAW_ID_NAMED, name) ? RAW_ID_NAMED[name] : whole;
		});
	if (inPage) {
		_rapierChromeOwnsId('');
		const cleanTag = tag => /^<[A-Za-z]/.test(tag) ? tag.replace(rawAttribute, (whole, name, value) => {
			const key = name.toLowerCase();
			if (key === 'style' && /^<span(?=[\s>])/i.test(tag)) {
				const typed = globalThis.RapierMarkdownSpec.typography;
				const css = typed.style(typed.parseStyle(md.utils.unescapeAll(String(value || '').replace(/^["']|["']$/g, '').replace(/\\/g, '\\\\'))));
				return css ? ' style="' + md.utils.escapeHtml(css) + '"' : '';
			}
			return key.startsWith('data-') || key === 'for' || key === 'id' && _rapierChromeOwnsId(attributeText(value)) ? '' : whole;
		}) : tag;
		md.renderer.rules.html_inline = (tokens, idx) => cleanTag(tokens[idx].content);
		md.renderer.rules.html_block = (tokens, idx) => _rapierRawHtmlFragment(tokens[idx].content, cleanTag, md);
	}
	const inlineHtml = md.renderer.rules.html_inline || ((tokens, idx) => tokens[idx].content);
	md.renderer.rules.html_inline = (tokens, idx, ...rest) => {
		const swatch = /^<mark style="background-color:(#[0-9a-f]{6});?">$/i.exec(tokens[idx].content);
		const colour = swatch && Object.keys(RAPIER_PORTABLE_HIGHLIGHT_HEX).find(name => RAPIER_PORTABLE_HIGHLIGHT_HEX[name] === swatch[1].toLowerCase());
		return colour ? '<mark data-rapier-highlight="' + colour + '">' : inlineHtml(tokens, idx, ...rest);
	};

	const _ulOpenDefault = md.renderer.rules.bullet_list_open
		|| function (tokens, idx, opts, _env, self) { return self.renderToken(tokens, idx, opts); };
	const _rapierMarkLooseList = (tokens, idx) => {
		const token = tokens[idx], level = token.level;
		for (let scan = idx + 1; scan < tokens.length; scan++) {
			const next = tokens[scan];
			if (next.level <= level) break;
			if (next.type === 'paragraph_open' && !next.hidden && next.level === level + 2) {
				token.attrSet('data-rapier-list-loose', '');
				return;
			}
		}
	};
	md.renderer.rules.bullet_list_open = function (tokens, idx, opts, env, self) {
		const token = tokens[idx];
		token.attrSet('data-rapier-list-marker', token.markup || '-');
		_rapierMarkLooseList(tokens, idx);
		return _ulOpenDefault(tokens, idx, opts, env, self);
	};

	const _olOpenDefault = md.renderer.rules.ordered_list_open
		|| function (tokens, idx, opts, _env, self) { return self.renderToken(tokens, idx, opts); };
	md.renderer.rules.ordered_list_open = function (tokens, idx, opts, env, self) {
		const token = tokens[idx];
		token.attrSet('data-rapier-list-delimiter', token.markup === ')' ? ')' : '.');
		const startAttr = token.attrGet && token.attrGet('start');
		const start = parseInt(startAttr, 10);
		if (Number.isFinite(start) && start !== 1) {
			const existing = token.attrGet('style') || '';
			token.attrSet('style', (existing ? existing + ';' : '') + 'counter-reset:rapier-ol ' + (start - 1));
		}
		let generated = Number.isFinite(start) ? start : 1;
		for (let scan = idx + 1; scan < tokens.length && tokens[scan].level > token.level; scan++) {
			if (tokens[scan].type !== 'list_item_open' || tokens[scan].level !== token.level + 1) continue;
			if (tokens[scan].info === String(generated)) { generated++; continue; }
			token.attrSet('data-rapier-list-numbering', 'authored');
			break;
		}
		_rapierMarkLooseList(tokens, idx);
		return _olOpenDefault(tokens, idx, opts, env, self);
	};

	md.core.ruler.push('rapier_setext_rule', function (state) {
		let lines = null;
		for (let at = 0; at < state.tokens.length; at++) {
			const token = state.tokens[at];
			if (token.type !== 'heading_open') continue;
			if (token.markup !== '=' && token.markup !== '-') continue;
			if (!token.map) continue;
			if (lines === null) lines = state.src.split('\n');
			const underline = lines[token.map[1] - 1];
			if (typeof underline === 'string' && /^ {0,3}(?:=+|-+)[ \t]*$/.test(underline)) {
				token.attrSet('data-rapier-heading-rule', underline);
			}
		}
	});

	const _headingOpenDefault = md.renderer.rules.heading_open
		|| function (tokens, idx, opts, _env, self) { return self.renderToken(tokens, idx, opts); };
	md.renderer.rules.heading_open = function (tokens, idx, opts, env, self) {
		const token = tokens[idx];
		if (token.markup === '=' || token.markup === '-') {
			token.attrSet('data-rapier-heading-markup', token.markup);
		}
		return _headingOpenDefault(tokens, idx, opts, env, self);
	};

	const _fenceDefault = md.renderer.rules.fence;
	let _mathPromptedOnce = false;
	{
		let _diagramPromptedOnce = false;
		md.renderer.rules.fence = function (tokens, idx, opts, env, self) {
			const token = tokens[idx];
			token.attrSet('data-rapier-fence', token.markup || '```');
			token.attrSet('data-rapier-fence-info', token.info == null ? '' : String(token.info));
			const lang = String(token.info || '').trim().split(/\s+/)[0].toLowerCase();
			if (lang === 'math' && token.meta?.rapierFenceClosed !== false && token.meta?.mathSource !== undefined)
				return md.renderer.rules.math_block(tokens, idx, opts, env, self);
			if (lang === 'html') {const block = htmlPlaceholder(token, md.utils.escapeHtml); if (block) return block;}
			if (lang !== 'mermaid') return _fenceDefault(tokens, idx, opts, env, self);
			const src = String(token.content || '').replace(/\n$/, '');
			const fence = md.utils.escapeHtml(token.markup || '```');
			const info = token.info == null ? '' : String(token.info);
			const escapedSrc = md.utils.escapeHtml(src);
			const sourceHtml = '<pre class="diagram-source"><code data-rapier-fence="' + fence +
				'" data-rapier-fence-info="' + md.utils.escapeHtml(info) + '">' + escapedSrc + '</code></pre>';
			const encoded = encodeURIComponent(src);
			if (token.meta?.rapierFenceClosed === false) {
				return '<figure class="diagram-block diagram-block--error" data-diagram-state="error"' +
					' data-diagram-unclosed="" data-diagram-src="' + encoded + '">' +
					'<p class="diagram-reason">Mermaid block may be missing its closing <code>' + fence +
					'</code> fence. Text below is still inside the block.</p>' + sourceHtml + '</figure>\n';
			}
			const provider = env.rapierProviders === false ? null : _rapierProviders.mermaid;
			const native = globalThis.RapierFlowchart?.parseFlowchart(src).ok === true;
			const diagramReady = native || !!(provider && provider.status === 'ready' && typeof provider.renderToString === 'function');
			const mathProvider = env.rapierProviders === false ? null : _rapierProviders.math;
			const mathNeeded = provider?.requiresMath?.(src) === true;
			const mathReady = !mathNeeded || mathProvider?.status === 'ready';
			if (!mathReady && !env.rapierPassive && !mathProvider?.request?.() && env.rapierProviders !== false && !_mathPromptedOnce) {
				_mathPromptedOnce = true;
				try { _rapierUiMath.request(); } catch (_) {}
			}
			const ready = diagramReady && mathReady;
			if (!diagramReady && !env.rapierPassive && !provider?.request?.() && env.rapierProviders !== false && !_diagramPromptedOnce) {
				_diagramPromptedOnce = true;
				try { _rapierUiDiagram.request(); } catch (_) {}
			}
			const state = ready ? 'idle' : 'absent';
			return '<figure class="diagram-block' + (ready ? '' : ' diagram-block--absent') +
				'" data-diagram-src="' + encoded + '" data-diagram-state="' + state + '"' + (native ? ' data-diagram-native=""' : '') + '>' +
				sourceHtml +
				(ready ? '<div class="diagram-cache" hidden></div>' : '') +
				'</figure>\n';
		};
	}

	const _liOpenDefault = md.renderer.rules.list_item_open
		|| function (tokens, idx, opts, _env, self) { return self.renderToken(tokens, idx, opts); };
	md.renderer.rules.list_item_open = function (tokens, idx, opts, env, self) {
		const token = tokens[idx];
		if (token.info) token.attrSet('data-rapier-list-ordinal', String(token.info));
		return _liOpenDefault(tokens, idx, opts, env, self);
	};

	const preserveEmphasisMarkup = (ruleName, attrName) => {
		const fallback = md.renderer.rules[ruleName]
			|| function (tokens, idx, opts, _env, self) { return self.renderToken(tokens, idx, opts); };
		md.renderer.rules[ruleName] = function (tokens, idx, opts, env, self) {
			const token = tokens[idx];
			token.attrSet(attrName, token.markup || (ruleName === 'strong_open' ? '**' : '*'));
			return fallback(tokens, idx, opts, env, self);
		};
	};
	preserveEmphasisMarkup('em_open', 'data-rapier-emphasis');
	preserveEmphasisMarkup('strong_open', 'data-rapier-strong');

	{
		const _renderMath = (src, displayMode, env, authored) => {
			const marker = displayMode ? '$$' : '$';
			const source = authored || marker + src + marker, literal = md.utils.escapeHtml(source);
			let encoded;
			try { encoded = encodeURIComponent(source); }
			catch (error) { if (!(error instanceof URIError)) throw error; }
			const sourceHtml = '<span data-rapier-math-source="' + (encoded || '') + '">' + literal + '</span>';
			if (env.rapierPage) return sourceHtml;
			const mathProvider = env.rapierProviders === false ? null : _rapierProviders.math;
			if (!mathProvider || mathProvider.status !== 'ready' || typeof mathProvider.renderToString !== 'function') {
				if (!env.rapierPassive && !mathProvider?.request?.() && env.rapierProviders !== false && !_mathPromptedOnce) {
					_mathPromptedOnce = true;
					try { _rapierUiMath.request(); } catch (_) {}
				}
				return '<span class="math-placeholder" data-rapier-math-source="' + (encoded || '') + '" title="Install the math plug-in in Settings to show this equation.">'
						 + literal + '</span>';
			}
			try {
				let rendered;
				if (env.rapierMathEquations) {
					const combined = mathProvider.renderWithMathML(src, {displayMode});
					if (!combined || typeof combined.svg !== 'string' || !combined.semantics ||
						typeof combined.semantics !== 'object' || Array.isArray(combined.semantics) || !Array.isArray(combined.errors))
						throw new TypeError('The Rapier Math shared result is invalid.');
					rendered = combined.svg;
					env.rapierMathEquations.push({source, tex: src, displayMode,
						semantics: combined.semantics, errors: combined.errors});
				} else rendered = mathProvider.renderToString(src, {displayMode});
				if (encoded === undefined) return sourceHtml;
				return '<span class="math-rendered" data-math-src="'
						 + encoded + '">' + rendered + '</span>';
			}
			catch (error) {
				if (env.rapierMathEquations) throw error;
				return sourceHtml;
			}
		};
		md.renderer.rules.math_inline = (tokens, idx, _opts, env) => _renderMath(tokens[idx].content, false, env, tokens[idx].meta?.mathSource);
		md.renderer.rules.math_block  = (tokens, idx, _opts, env) => wrapDisplayMath(_renderMath(tokens[idx].content, true, env, tokens[idx].meta?.mathSource)) + '\n';
	}
	globalThis.RapierMarkdownLayout.installMarkdownLayout(md);
	globalThis.RapierImageAssets.configureParser(md, _rapierSplitOpeningFrontmatter);
	const render = md.renderer.render;
	md.renderer.render = function (tokens, options, env) {
		return render.call(this, _rapierHideForeignParagraphs(_rapierCloseOpenDetails(tokens)), options, env);
	};
}

function _rapierHtmlTagStack(html, stack = []) {
	if (!html) return stack;
	const swallow = _rapierHtmlTagStack.swallow || (_rapierHtmlTagStack.swallow = new Set('select template textarea title style xmp plaintext noscript iframe noembed noframes script svg math'.split(' ')));
	const rawTags = _rapierHtmlTagStack.raw || (_rapierHtmlTagStack.raw = new Set('script style textarea title xmp iframe noembed noframes noscript plaintext'.split(' ')));
	let i = 0;
	while (i < html.length) {
		const top = stack.at(-1);
		if (top && top.raw) {
			const closer = new RegExp('</' + top.name + '(?=[\\t\\n\\f\\r />])', 'ig');
			closer.lastIndex = i;
			const found = closer.exec(html);
			if (!found) break;
			i = found.index;
		}
		const open = html.indexOf('<', i);
		if (open < 0) break;
		if (html.startsWith('<!--', open)) {
			const end = html.indexOf('-->', open + 4);
			if (end < 0) break;
			i = end + 3;
			continue;
		}
		if (html.startsWith('<!', open) || html.startsWith('<?', open)) {
			const end = html.indexOf('>', open + 2);
			i = end < 0 ? html.length : end + 1;
			continue;
		}
		const match = /^<\/?([A-Za-z][A-Za-z0-9:-]*)/.exec(html.slice(open));
		if (!match) { i = open + 1; continue; }
		const name = match[1].toLowerCase();
		let end = open + match[0].length, quote = '';
		for (; end < html.length; end++) {
			const character = html[end];
			if (quote) { if (character === quote) quote = ''; }
			else if (character === '"' || character === "'") quote = character;
			else if (character === '>') break;
		}
		if (end >= html.length) break;
		if (html[open + 1] === '/') {
			let at = stack.length - 1;
			while (at >= 0 && stack[at].name !== name && !swallow.has(stack[at].name)) at--;
			if (at >= 0 && stack[at].name === name) stack.length = at;
		} else stack.push({name, at: open, tagEnd: end + 1, raw: rawTags.has(name)});
		i = end + 1;
	}
	return stack;
}
function _rapierForeignOpen(stack) {
	for (let index = 0; index < stack.length; index++) {
		const name = stack[index].name;
		if (name === 'svg' || name === 'math') return true;
	}
	return false;
}
function _rapierSealBlockHtml(html) {
	if (!html || html.indexOf('<') < 0) return html;
	const stack = _rapierHtmlTagStack(html);
	const swallow = _rapierHtmlTagStack.swallow;
	const foreign = _rapierSealBlockHtml.foreign || (_rapierSealBlockHtml.foreign = new Set(['svg', 'math']));
	const cut = stack.find(frame => swallow.has(frame.name) && (frame.raw || foreign.has(frame.name)));
	if (cut) {
		const wrappers = stack.filter(frame => frame.at < cut.at);
		return html.slice(0, cut.at) + _rapierSealBlockTail(html.slice(cut.at), wrappers);
	}
	const stale = stack.filter(frame => swallow.has(frame.name));
	if (!stale.length) return html;
	let out = html;
	for (const frame of stale.sort((left, right) => right.at - left.at))
		out = out.slice(0, frame.at) + escapeRapierHtmlText(out.slice(frame.at, frame.tagEnd)) + out.slice(frame.tagEnd);
	return out;
}

function _rapierSealBlockTail(tail, wrappers) {
	const open = wrappers.map(frame => frame.name);
	let out = '', i = 0;
	while (i < tail.length) {
		const at = tail.indexOf('<', i);
		if (at < 0) { out += escapeRapierHtmlText(tail.slice(i)); break; }
		out += escapeRapierHtmlText(tail.slice(i, at));
		const match = /^<\/([A-Za-z][A-Za-z0-9:-]*)\s*>/.exec(tail.slice(at));
		if (match && open.at(-1) === match[1].toLowerCase()) {
			out += match[0];
			open.pop();
			i = at + match[0].length;
			continue;
		}
		out += escapeRapierHtmlText(tail[at]);
		i = at + 1;
	}
	return out;
}

function _rapierRenderTokenHtml(tokens, index, env) {
	const token = tokens[index], rule = md.renderer.rules[token.type];
	return token.type === 'inline' ? md.renderer.renderInline(token.children, md.options, env)
		: rule ? rule(tokens, index, md.options, env, md.renderer) : md.renderer.renderToken(tokens, index, md.options);
}

function _rapierTokenBlocks(tokens) {
	const blocks = [];
	let start = 0, depth = 0;
	for (let index = 0; index < tokens.length; index++) {
		depth += tokens[index].nesting || 0;
		if (depth <= 0) { blocks.push([start, index + 1]); start = index + 1; depth = 0; }
	}
	if (start < tokens.length) blocks.push([start, tokens.length]);
	return blocks;
}
function _rapierScanHtmlBlocks(tokens, start, end, stack) {
	for (let index = start; index < end; index++) {
		if (tokens[index].type === 'html_block') _rapierHtmlTagStack(tokens[index].content || '', stack);
	}
	return stack;
}
function _rapierForeignSealRanges(tokens) {
	const blocks = _rapierTokenBlocks(tokens);
	const ranges = [];
	const scanLater = ([start, end], frames) => {
		if (tokens[start].type !== 'paragraph_open') return _rapierScanHtmlBlocks(tokens, start, end, frames);
		for (const child of tokens[start + 1] && tokens[start + 1].children || [])
			if (child.type === 'html_inline') _rapierHtmlTagStack(child.content || '', frames);
		return frames;
	};
	for (let index = 0; index < blocks.length; index++) {
		const stack = _rapierScanHtmlBlocks(tokens, blocks[index][0], blocks[index][1], []);
		if (!_rapierForeignOpen(stack)) { ranges.push(blocks[index]); continue; }
		const frames = stack.map(frame => ({name: frame.name, raw: frame.raw}));
		let joined = -1;
		for (let later = index + 1; later < blocks.length && later <= index + 512; later++) {
			scanLater(blocks[later], frames);
			if (!_rapierForeignOpen(frames)) { joined = later; break; }
		}
		if (joined < 0) { ranges.push(blocks[index]); continue; }
		const range = [blocks[index][0], blocks[joined][1]];
		for (let later = index + 1; later <= joined; later++) {
			const [start, end] = blocks[later];
			if (tokens[start].type === 'paragraph_open' && tokens[end - 1].type === 'paragraph_close' &&
				(tokens[start + 1] && tokens[start + 1].children || []).some(child => child.type === 'html_inline'))
				(range.hide || (range.hide = new Set())).add(start).add(end - 1);
		}
		ranges.push(range);
		index = joined;
	}
	return ranges;
}
function _rapierHideForeignParagraphs(tokens) {
	let out = tokens;
	for (const range of _rapierForeignSealRanges(tokens)) {
		if (!range.hide) continue;
		if (out === tokens) out = tokens.slice();
		for (const index of range.hide) out[index] = Object.assign(Object.create(Object.getPrototypeOf(tokens[index])), tokens[index], {hidden: true});
	}
	return out;
}
function _rapierMergeForeignBlocks(blocks, source, parser) {
	const text = String(source || '');
	const out = [];
	const inline = new Map();
	const scanLater = (row, frames) => {
		if (!row) return frames;
		if (row.type === 'html_block') return _rapierHtmlTagStack(String(row.raw || ''), frames);
		if (row.type !== 'paragraph' || String(row.raw || '').indexOf('<') < 0) return frames;
		let children = inline.get(row);
		if (!children) {
			if (!parser && !md) initMarkdownIt();
			const parsed = (parser || md).parseInline(String(row.raw || ''), {});
			children = parsed[0] && parsed[0].children || [];
			inline.set(row, children);
		}
		for (const child of children) if (child.type === 'html_inline') _rapierHtmlTagStack(child.content || '', frames);
		return frames;
	};
	let index = 0;
	while (index < blocks.length) {
		const block = blocks[index];
		const stack = [];
		if (block && block.type === 'html_block') _rapierHtmlTagStack(String(block.raw || ''), stack);
		if (!_rapierForeignOpen(stack)) { out.push(block); index++; continue; }
		const frames = stack.map(frame => ({name: frame.name, raw: frame.raw}));
		let joined = -1;
		for (let later = index + 1; later < blocks.length && later <= index + 512; later++) {
			scanLater(blocks[later], frames);
			if (!_rapierForeignOpen(frames)) { joined = later; break; }
		}
		if (joined < 0) { out.push(block); index++; continue; }
		const start = Number(block._sourceStart), end = Number(blocks[joined]._sourceEnd);
		const raw = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && end <= text.length
			? text.slice(start, end)
			: blocks.slice(index, joined + 1).map(row => String(row && row.raw || '')).join('\n\n');
		out.push({...block, raw, _sourceEnd: Number.isFinite(end) ? end : block._sourceEnd, rendered: null});
		index = joined + 1;
	}
	out._rapierFacts = Array.isArray(blocks && blocks._rapierFacts) ? blocks._rapierFacts.slice() : [];
	return out;
}
function _rapierRenderSealedHtml(tokens, env) {
	let html = '';
	for (const range of _rapierForeignSealRanges(tokens)) {
		let block = '';
		for (let index = range[0]; index < range[1]; index++) block += range.hide && range.hide.has(index) ? (tokens[index].nesting < 0 ? '\n' : '') : _rapierRenderTokenHtml(tokens, index, env);
		html += _rapierSealBlockHtml(block);
	}
	return html;
}

function _rapierRenderSemanticRoot(canonical, metadata, options = {}) {
	const root = document.createElement('template').content.ownerDocument.createElement('div');
	root.setAttribute('data-rapier-semantic-root', 'true');

	if (metadata.docKind !== 'markdown') {
		const pre = document.createElement('pre');
		const code = document.createElement('code');
		const lang = metadata.docKind === 'code'
			? String(metadata.codeLang || '').replace(/[^a-z0-9_-]/gi, '').toLowerCase()
			: '';
		if (lang) code.className = 'language-' + lang;
		code.textContent = String(canonical || '');
		pre.appendChild(code);
		root.appendChild(pre);
		return root;
	}

	const markdown = _rapierSplitOpeningFrontmatter(canonical).body;
	const env = {rapierImagePresentation: options.imagePresentation === true, rapierPassive: options.passive === true, ...(options.page ? {rapierPage: true} : {}), ...(options.providers === false ? {rapierProviders: false} : {})};
	if (options.wikiEmbedding) env.rapierWikiEmbedding = true;
	const wikiLinks = wikiMode(options);
	if (wikiLinks) env.rapierWikiLinks = wikiLinks;
	if (options.mathEquations) env.rapierMathEquations = options.mathEquations;
	const nesting = md && options.maxNesting > 0 ? options.maxNesting : 0;
	let cutAt = -1, rendered = '';
	codeLeft = options.codeBudget >= 0 ? options.codeBudget : Infinity;
	try {
	if (!md) rendered = '<pre><code>' + escapeRapierHtmlText(markdown) + '</code></pre>';
	else {
		const saved = md.options.maxNesting;
		if (nesting) md.options.maxNesting = nesting;
		try {
			let tokens = md.parse(markdown, env);
			if (nesting) cutAt = _rapierNestingCutAt(tokens, nesting);
			tokens = _rapierCloseOpenDetails(tokens);
			rendered = _rapierRenderSealedHtml(tokens, env);
			if (md.renderer.rapierTransformHtml) rendered = md.renderer.rapierTransformHtml(rendered);
		} finally { md.options.maxNesting = saved; }
	}
	} finally { codeLeft = Infinity; }
	if (md && env.footnotes && Array.isArray(env.footnotes.list) && env.footnotes.list.length) {
		const labels = env.footnotes.list.map((item, index) =>
			String(item && item.label || ('inline-' + (index + 1))));
		rendered = _relabelFootnoteHtml(rendered, labels);
	}
	root.innerHTML = sanitizeRapierHtml(rendered, options.page ? 'source' : 'export');
	if (cutAt >= 0) _rapierAppendNestingCut(root, markdown, cutAt);
	_rapierApplyBlockDirection(root, false, options);

	_rapierAssignHeadingSlugs(root, RAPIER_RENDERED_HEADING_SELECTOR, false, options.carry?.slugs, options.carry?.headingIds);
	_rapierDisambiguateRenderedAnchors(root);

	root.querySelectorAll('pre > code').forEach(_rapierNormalizeCodeElement);
	_rapierMarkTableCaptions(root, options.carry);
	_rapierMarkFigureCaptions(root);
	_rapierMarkListContinuations(_rapierChildElements(root));
	_rapierDecorateJumpLists(root, options.carry);
	return root;
}

function _rapierAppendNestingCut(root, markdown, cutAt) {
	const note = root.ownerDocument.createElement('p'), pre = root.ownerDocument.createElement('pre'), code = root.ownerDocument.createElement('code');
	note.setAttribute('data-rapier-nesting-cut', 'true');
	note.textContent = 'Nesting is too deep to show here. The rest of the document follows as plain text.';
	code.textContent = String(markdown).split('\n').slice(cutAt).join('\n');
	pre.append(code);
	root.append(note, pre);
}
const _rapierNestingCutAt = (tokens, nesting) => { const deepest = tokens.find(token => token.level >= nesting - 1 && token.map); return deepest ? deepest.map[0] + 1 : -1; };
async function _rapierRenderSemanticRootAsync(canonical, metadata, options = {}) {
	const work = options.work || options;
	check(work);
	if (metadata.docKind !== 'markdown' || !md) {
		const root = _rapierRenderSemanticRoot(canonical, metadata, options);
		await pause(work, .5);
		return root;
	}
	const markdown = _rapierSplitOpeningFrontmatter(canonical).body;
	const fallbackEnv = options.page ? {rapierPage: true} : {};
	const wikiLinks = markdown.includes('[[') && wikiMode(options);
	if (wikiLinks) fallbackEnv.rapierWikiLinks = wikiLinks;
	const nesting = options.maxNesting > 0 ? options.maxNesting : 0, saved = md.options.maxNesting;
	if (nesting) md.options.maxNesting = nesting;
	let parsed;
	try { parsed = !wikiLinks && options.parsed || (runtime.parseAsync && !wikiLinks && !nesting ? await runtime.parseAsync(markdown, options) : {tokens: md.parse(markdown, fallbackEnv), env: fallbackEnv}); }
	finally { md.options.maxNesting = saved; }
	let {tokens, env} = parsed, labels = env.footnotes?.list?.map((item, index) => String(item?.label || ('inline-' + (index + 1))));
	const cutAt = nesting ? _rapierNestingCutAt(tokens, nesting) : -1;
	tokens = _rapierCloseOpenDetails(tokens);
	env = {...env, rapierImagePresentation: options.imagePresentation === true, rapierPassive: options.passive === true};
	await pause(work, .3);
	const inert = document.createElement('template').content.ownerDocument;
	const root = inert.createElement('div'), part = inert.createElement('div'), boundary = htmlBoundary();
	root.setAttribute('data-rapier-semantic-root', 'true');
	let html = '', began = performance.now(), complete = false;
	codeLeft = options.codeBudget >= 0 ? options.codeBudget : Infinity;
	const append = () => {
		if (md.renderer.rapierTransformHtml) html = md.renderer.rapierTransformHtml(html);
		if (labels?.length) html = _relabelFootnoteHtml(html, labels);
		admitHtml(part, html, sanitizeRapierHtml, runtime.sanitizeRapierFragment, options.page ? 'source' : 'export');
		while (part.firstChild) root.appendChild(part.firstChild);
		html = '';
	};
	const finishBlock = block => {
		const sealed = _rapierSealBlockHtml(block);
		html += sealed;
		if (boundary(sealed) && html.length >= 16384) append();
	};
	try {
		for (const range of _rapierForeignSealRanges(tokens)) {
			let block = '';
			for (let index = range[0]; index < range[1]; index++) {
				block += range.hide && range.hide.has(index) ? (tokens[index].nesting < 0 ? '\n' : '') : _rapierRenderTokenHtml(tokens, index, env);
				if (performance.now() - began >= 8) {
					await pause(work, .3 + .2 * (index + 1) / tokens.length);
					began = performance.now();
				}
			}
			finishBlock(block);
		}
		if (html) append();
		if (cutAt >= 0) _rapierAppendNestingCut(root, markdown, cutAt);
		parsed = tokens = env = labels = null;
		await finishAsync(_rapierSemanticDecorations(root, options.carry, options), work);
		await pause(work, .6);
		complete = true;
		return root;
	} finally { codeLeft = Infinity; if (!complete) { root.replaceChildren(); part.replaceChildren(); } }
}

function _rapierPartDecorationGroups(tokens) {
	const groups = [];
	for (let at = 0; at < tokens.length; at++) {
		const first = tokens[at];
		if (first.type !== 'heading_open' && first.type !== 'table_open') continue;
		const close = first.type === 'heading_open' ? 'heading_close' : 'table_close';
		let end = at + 1;
		while (end < tokens.length && !(tokens[end].type === close && tokens[end].level === first.level)) end++;
		end++;
		if (first.type === 'table_open' && tokens[end]?.type === 'paragraph_open' && tokens[end].level === first.level) {
			while (end < tokens.length && !(tokens[end].type === 'paragraph_close' && tokens[end].level === first.level)) end++;
			end++;
		}
		groups.push(tokens.slice(at, end));
		at = end - 1;
	}
	return groups;
}

function _rapierReadPartDecorations(canonical, metadata, options = {}) {
	const carry = options.carry || {slugs: Object.create(null), captions: 0, continued: true}, captionStart = carry.captions || 0;
	const markdown = _rapierSplitOpeningFrontmatter(canonical).body, env = {rapierImagePresentation: options.imagePresentation === true, rapierPassive: true, rapierPartDecorations: true,
		...(options.page ? {rapierPage: true} : {}), ...(options.providers === false ? {rapierProviders: false} : {})};
	if (options.wikiEmbedding) env.rapierWikiEmbedding = true;
	const wikiLinks = wikiMode(options);
	if (wikiLinks) env.rapierWikiLinks = wikiLinks;
	if (options.mathEquations) env.rapierMathEquations = options.mathEquations;
	const saved = md.options.maxNesting;
	let tokens;
	try {
		if (options.maxNesting > 0) md.options.maxNesting = options.maxNesting;
		tokens = md.parse(markdown, env);
	} finally { md.options.maxNesting = saved; }
	if (tokens.some(token => token.type === 'html_block' || token.type === 'math_block' || token.type.startsWith('footnote_') ||
			token.type === 'inline' && token.children?.some(child => child.type === 'html_inline' || child.type === 'math_inline' || child.type.startsWith('footnote_')))) {
		const root = _rapierRenderSemanticRoot(canonical, metadata, {...options, carry, codeBudget: 0, passive: true});
		return Object.freeze({headingIds: Object.freeze([...root.querySelectorAll(RAPIER_RENDERED_HEADING_SELECTOR)].map(heading => heading.id)), captionStart});
	}
	const html = [];
	for (const group of _rapierPartDecorationGroups(tokens)) html.push('<div>', md.renderer.render(group, md.options, env), '</div>');
	const root = document.createElement('template').content.ownerDocument.createElement('div');
	root.innerHTML = sanitizeRapierHtml(html.join(''), 'export');
	_rapierAssignHeadingSlugs(root, RAPIER_RENDERED_HEADING_SELECTOR, false, carry.slugs);
	const headingIds = Object.freeze([...root.querySelectorAll(RAPIER_RENDERED_HEADING_SELECTOR)].map(heading => heading.id));
	_rapierMarkTableCaptions(root, carry);
	return Object.freeze({headingIds, captionStart});
}

function* _rapierSemanticDecorations(root, carry = null, options = {}) {
	yield* _rapierApplyBlockDirectionSteps(root, false, options); yield;
	yield* _rapierAssignHeadingSlugsSteps(root, RAPIER_RENDERED_HEADING_SELECTOR, false, carry?.slugs, carry?.headingIds); yield;
	yield* _rapierDisambiguateRenderedAnchorsSteps(root); yield;
	for (const code of root.querySelectorAll('pre > code')) { _rapierNormalizeCodeElement(code); yield; }
	yield* _rapierMarkTableCaptionsSteps(root, carry); yield;
	yield* _rapierMarkFigureCaptionsSteps(root); yield;
	yield* _rapierMarkListContinuationsSteps(_rapierChildElements(root)); yield;
	yield* _rapierDecorateJumpListsSteps(root, carry); yield;
}

function _rapierInstallSemanticProbe(instance) {
	if (!instance || instance.__rapierSemanticProbeInstalled) return;
	instance.__rapierSemanticProbeInstalled = true;
	const originalParse = instance.inline.parse;
	instance.inline.parse = function (source, parser, env, outTokens) {
		const targetEnv = env || {};
		const priorId = targetEnv.__rapierInlineProbeId || 0;
		const nextId = (targetEnv.__rapierInlineProbeSeq || 0) + 1;
		targetEnv.__rapierInlineProbeSeq = nextId;
		targetEnv.__rapierInlineProbeId = nextId;
		const candidateStart = targetEnv.__rapierInlineCandidates?.length || 0;
		try {
			const result = originalParse.call(this, source, parser, targetEnv, outTokens);
			if ((targetEnv.__rapierInlineCandidates?.length || 0) > candidateStart) {
				Object.defineProperty(outTokens, '_rapierInlineProbeId', { value: nextId, configurable: true });
				for (const token of outTokens) {
					Object.defineProperty(token, '_rapierInlineProbeId', { value: nextId, configurable: true });
				}
			}
			return result;
		} finally { targetEnv.__rapierInlineProbeId = priorId; }
	};

	instance.inline.ruler.before('escape', 'rapier_semantic_probe', function (state, silent) {
		if (silent || !state || !state.env) return false;
		const opener = state.src.charCodeAt(state.pos);
		if (opener !== 0x5b && opener !== 0x21) return false;
		const inlineId = Number(state.env.__rapierInlineProbeId || 0);
		if (!inlineId) return false;
		const src = state.src;
		const pos = state.pos;
		const max = state.posMax;
		const record = fact => {
			if (!Array.isArray(state.env.__rapierInlineCandidates)) state.env.__rapierInlineCandidates = [];
			state.env.__rapierInlineCandidates.push({ inlineId, ...fact });
		};

		if (src.charCodeAt(pos) === 0x5b && src.charCodeAt(pos + 1) === 0x5e) {
			let end = pos + 2;
			while (end < max) {
				const code = src.charCodeAt(end);
				if (code === 0x20 || code === 0x0a) return false;
				if (code === 0x5d) break;
				end++;
			}
			if (end > pos + 2 && end < max && src.charCodeAt(end) === 0x5d) {
				const label = src.slice(pos + 2, end);
				record({ kind: 'footnote-use', rawKey: label, localStart: pos, localEnd: end + 1, label: label.slice(0, 240), evidence: { syntax: 'footnote-reference' } });
			}
			return false;
		}

		let image = false;
		let labelStart = pos;
		if (src.charCodeAt(pos) === 0x21 && src.charCodeAt(pos + 1) === 0x5b) {
			image = true;
			labelStart = pos + 1;
		} else if (src.charCodeAt(pos) !== 0x5b) {
			return false;
		} else if (pos > 0 && src.charCodeAt(pos - 1) === 0x21) {
			return false;
		}
		const firstEnd = state.md.helpers.parseLinkLabel(state, labelStart, false);
		if (firstEnd < 0) return false;
		const firstLabel = src.slice(labelStart + 1, firstEnd);
		const after = firstEnd + 1;

		if (src.charCodeAt(after) === 0x5b) {
			const secondEnd = state.md.helpers.parseLinkLabel(state, after, false);
			if (secondEnd < 0) return false;
			const explicitLabel = src.slice(after + 1, secondEnd);
			const rawKey = explicitLabel.length ? explicitLabel : firstLabel;
			record({
				kind: image ? 'image-reference-use' : 'link-reference-use', rawKey,
				localStart: pos, localEnd: secondEnd + 1,
				label: rawKey.slice(0, 240),
				evidence: { syntax: explicitLabel.length ? 'full-reference' : 'collapsed-reference' },
			});
			return false;
		}

		if (src.charCodeAt(after) === 0x28) {
			let destinationPos = after + 1;
			while (destinationPos < max && /[ \t\n]/.test(src.charAt(destinationPos))) destinationPos++;
			const first = src.charCodeAt(destinationPos);
			if (first !== 0x23 && first !== 0x3c && first !== 0x5c && first !== 0x26) return false;
			const destination = state.md.helpers.parseLinkDestination(src, destinationPos, max);
			if (!destination || !destination.ok || !String(destination.str || '').startsWith('#')) return false;
			const rawDestination = String(destination.str || '');
			const destinationSlice = src.slice(destinationPos, destination.pos);
			const hashAt = destinationSlice.indexOf(rawDestination);
			if (hashAt < 0 || destinationSlice.indexOf(rawDestination, hashAt + 1) >= 0) return false;
			record({
				kind: 'local-link-use', rawKey: rawDestination.slice(1),
				localStart: destinationPos + hashAt, localEnd: destinationPos + hashAt + rawDestination.length,
				label: rawDestination.slice(0, 240), evidence: { syntax: 'inline-destination' },
			});
			return false;
		}

		const normalize = state.md.utils && state.md.utils.normalizeReference;
		const normalized = typeof normalize === 'function' ? normalize(firstLabel) : firstLabel.trim().replace(/\s+/g, ' ').toUpperCase();
		if ((image || (state.env.references && state.env.references[normalized])) && firstLabel) {
			record({
				kind: image ? 'image-reference-use' : 'link-reference-use', rawKey: firstLabel,
				localStart: pos, localEnd: firstEnd + 1,
				label: firstLabel.slice(0, 240), evidence: { syntax: 'shortcut-reference' },
			});
		}
		return false;
	});

	try {
		instance.core.ruler.before('footnote_tail', 'rapier_footnote_definition_probe', function (state) {
			const out = [];
			const tokens = state && Array.isArray(state.tokens) ? state.tokens : [];
			const signatureFor = values => {
				let hash = 0x811c9dc5;
				for (const value of values) {
					const text = String(value == null ? '' : value);
					for (let index = 0; index < text.length; index++) {
						hash ^= text.charCodeAt(index);
						hash = Math.imul(hash, 0x01000193) >>> 0;
					}
					hash ^= 0xff;
					hash = Math.imul(hash, 0x01000193) >>> 0;
				}
				return hash.toString(16).padStart(8, '0');
			};
			for (let index = 0; index < tokens.length; index++) {
				const open = tokens[index];
				if (!open || open.type !== 'footnote_reference_open' || !open.meta || open.meta.label == null) continue;
				let end = index + 1;
				let startLine = Number.POSITIVE_INFINITY;
				let endLine = -1;
				const semantic = [];
				for (; end < tokens.length; end++) {
					const token = tokens[end];
					if (!token) continue;
					if (token.type === 'footnote_reference_close') break;
					if (Array.isArray(token.map)) {
						startLine = Math.min(startLine, Number(token.map[0]));
						endLine = Math.max(endLine, Number(token.map[1]));
					}
					semantic.push(token.type, token.tag, token.nesting, token.markup, token.content);
				}
				if (Number.isFinite(startLine) && endLine >= startLine) {
					out.push({
						label: String(open.meta.label), startLine, endLine,
						signature: signatureFor(semantic),
					});
				}
				index = end;
			}
			state.env.__rapierFootnoteDefinitions = out;
		});
	} catch (_) {}
}

function _rapierImageAltSize(value) {
	const parts = _rapierImageAltSourceParts(value);
	return parts.width ? parts : null;
}

function _rapierImageAltSourceParts(value) {
	const source = String(value || '');
	const pipe = source.lastIndexOf('|');
	if (pipe < 0 || _rapierSourceCharEscaped(source, pipe)) return { alt: source, width: 0 };
	const widthText = source.slice(pipe + 1);
	if (!/^[1-9]\d{1,3}$/.test(widthText)) return { alt: source, width: 0 };
	const width = Math.max(32, Math.min(2400, Number(widthText)));
	return { alt: source.slice(0, pipe), width };
}

function _rapierImageAltText(value, env = {}) {
	const tokens = md.parseInline(String(value ?? ''), env);
	return md.renderer.renderInlineAsText(tokens[0]?.children || [], md.options, env);
}

function _rapierImageGeometryFacts(geometry, automatic) {
    const w = Number(geometry?.width), h = Number(geometry?.height);
    const known = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && Number.isFinite(w / h) && w / h > 0;
    const width = known ? w : 0, height = known ? h : 0;
    const styles = known ? [['aspect-ratio', width + '/' + height]] : automatic ? [['aspect-ratio', '1/1']] : [];
    if (automatic) {
        const ratio = known ? width / height : 1;
        const share = Math.min(1, ratio, 1.6 / (1 + 1 / ratio));
        styles.push(['--rapier-image-auto-width', Number((share * 100).toFixed(6)) + '%'],
            ['--rapier-image-natural-width', known ? width + 'px' : '100%']);
    }
    return {width, height, styles};
}

function _rapierApplyImageGeometry(image, geometry) {
    if (image?.tagName !== 'IMG' || image.hasAttribute('data-rapier-html')) return false;
    const mode = image.getAttribute('data-rapier-image-geometry');
    if (!['auto', 'sized', 'natural'].includes(mode)) return false;
    const native = geometry === undefined;
    if (native) {
        if (!image.isConnected || !image.complete || image.hasAttribute('data-rapier-asset') || image.hasAttribute('data-rapier-image-url')) return false;
        geometry = {width: image.naturalWidth, height: image.naturalHeight};
    }
    const facts = _rapierImageGeometryFacts(geometry, mode === 'auto');
    if (!facts.width || !facts.height) return false;
    const attributes = [
        ['data-rapier-natural-width', String(facts.width)], ['data-rapier-natural-height', String(facts.height)],
        ...(!image.hasAttribute('data-rapier-image-size') ? [['width', String(facts.width)]] : []), ['height', String(facts.height)],
    ].filter(([name, value]) => image.getAttribute(name) !== value);
    const styles = facts.styles.filter(([name, value]) => (name === 'aspect-ratio'
        ? image.style.getPropertyValue(name).replace(/\s/g, '') : image.style.getPropertyValue(name)) !== value);
    if (!attributes.length && !styles.length) return false;
    if (native) {
        const src = image.getAttribute('src'), current = image.currentSrc;
        if (!src || !current) return false;
        try { if (src !== current && new URL(src, image.ownerDocument.baseURI).href !== current) return false; }
        catch (_) { return false; }
    }
    for (const [name, value] of attributes) image.setAttribute(name, value);
    for (const [name, value] of styles) image.style.setProperty(name, value);
    return true;
}

function _rapierImageSizeAttributes(size, marker, geometry, automatic = true) {
    const layout = globalThis.RapierMarkdownLayout.parseLayout(marker || '');
    let style = layout && !_rapierPlainLayout() ? globalThis.RapierMarkdownLayout.imageStyle(layout) : '';
    let attributes = '';
    if (layout?.width != null && style) attributes = ' data-md-image-width="' + layout.width + '"';
    else if (size) {
        attributes = ' width="' + size.width + '" data-rapier-image-size="' + size.width + '"';
        style = '--md-image-width:' + size.width + 'px' + (style ? ';' + style : '');
    }
    if (geometry !== undefined) {
        const mode = size || layout?.width != null || layout?.lines != null ? 'sized' : automatic ? 'auto' : 'natural';
        const facts = _rapierImageGeometryFacts(geometry, mode === 'auto');
        attributes += ' data-rapier-image-geometry="' + mode + '"';
        if (facts.width) {
            attributes += ' data-rapier-natural-width="' + facts.width + '" data-rapier-natural-height="' + facts.height + '"';
            if (!size || !attributes.includes(' width=')) attributes += ' width="' + facts.width + '"';
            attributes += ' height="' + facts.height + '"';
        }
        style = [...facts.styles.map(([name, value]) => name + ':' + value), ...(style ? [style] : [])].join(';');
    }
    return attributes + (style ? ' style="' + style + '"' : '');
}

function _rapierCloseOpenDetails(tokens) {
	const opens = /^<details[\t\n\f\r />]/i, closes = /^<\/details[\t\n\f\r ]*>$/i;
	const tags = token => {
		const found = [];
		if (token.type === 'html_inline') found.push(token.content);
		else if (token.type === 'html_block') {
			let raw = '';
			_rapierRawHtmlFragment(token.content, tag => {
				if (raw) { if (new RegExp('^</' + raw + '[\\t\\n\\f\\r ]*>$', 'i').test(tag)) raw = ''; }
				else {
					const literal = /^<(script|style|textarea|title|xmp|iframe|noembed|noframes|plaintext)(?=[\t\n\f\r />])/i.exec(tag);
					if (literal) raw = literal[1];
					else found.push(tag);
				}
				return tag;
			}, md);
		}
		else if (token.type === 'inline') for (const child of token.children || []) if (child.type === 'html_inline') found.push(child.content);
		return found;
	};
	const after = new Map(), add = (index, count) => after.set(index, (after.get(index) || 0) + count);
	const waiting = [];
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		let depth = 0;
		for (const tag of tags(token)) {
			if (opens.test(tag)) { if (token.type === 'html_block') waiting.push(index); else depth++; }
			else if (closes.test(tag)) { if (depth) depth--; else waiting.pop(); }
		}
		if (depth) add(index + 1 < tokens.length && tokens[index + 1].nesting === -1 ? index + 1 : index, depth);
	}
	for (const index of waiting) add(index, 1);
	if (!after.size) return tokens;
	const out = [];
	tokens.forEach((token, index) => {
		out.push(token);
		const count = after.get(index);
		if (count) out.push({type: 'html_block', tag: '', attrs: null, map: null, nesting: 0, level: token.level || 0, children: null,
			content: '</details>'.repeat(count) + '\n', markup: '', info: '', meta: null, block: true, hidden: false});
	});
	return out;
}

function _rapierRawHtmlFragment(source, rewrite, parser) {
	const state = new parser.inline.State(source, parser, {}, []);
	const htmlRule = parser.inline.ruler.__rules__.find(rule => rule.name === 'html_inline').fn;
	let out = '';
	while (state.pos < state.posMax) {
		const at = state.src.indexOf('<', state.pos);
		if (at < 0) { out += state.src.slice(state.pos); break; }
		out += state.src.slice(state.pos, at); state.pos = at;
		if (htmlRule(state, false)) out += rewrite(state.tokens.pop().content);
		else { out += '&lt;'; state.pos++; }
	}
	return out;
}

function _rapierApplyBlockDirection(root, includeRoot = false, options = {}) { return finish(_rapierApplyBlockDirectionSteps(root, includeRoot, options)); }

function* _rapierApplyBlockDirectionSteps(root, includeRoot = false, {authoredTableDirection = false} = {}) {
	if (!root || typeof root.querySelectorAll !== 'function') return;
	const tableContainers = new Set();
	if (authoredTableDirection) for (const table of root.querySelectorAll('table')) {
		for (let parent = table.parentElement; parent && parent !== root && !tableContainers.has(parent); parent = parent.parentElement) {
			tableContainers.add(parent); yield;
		}
	}
	const blocks = new Set(_RAPIER_DIR_BLOCKS.split(',')), elements = root.ownerDocument.createTreeWalker(root, 1);
	for (let el = includeRoot ? root : elements.nextNode(); el; el = elements.nextNode()) {
		yield;
		if (!blocks.has(el.localName) || tableContainers.has(el)) continue;
		let literal = false;
		for (let parent = el.parentElement; parent; parent = parent.parentElement)
			if (parent.localName === 'pre' || parent.localName === 'code') { literal = true; break; }
		if (literal) continue;
		let dir = 'ltr', found = false;
		const walker = el.ownerDocument.createTreeWalker(el, 4);
		let scanned = 0;
		for (let text = walker.nextNode(); text && !found; text = walker.nextNode()) {
			for (const character of text.nodeValue || '') {
				if (++scanned % 1024 === 0) yield;
				const strong = _rapierBidiStrong(character.codePointAt(0));
				if (strong) { dir = strong === 'R' ? 'rtl' : 'ltr'; found = true; break; }
			}
		}
		if (el.getAttribute('dir') !== dir) el.setAttribute('dir', dir);
	}
}

function _rapierFirstStrongDir(text) {
	const value = String(text || '');
	for (let i = 0; i < value.length;) {
		const cp = value.codePointAt(i);
		i += cp > 0xFFFF ? 2 : 1;
		const strong = _rapierBidiStrong(cp);
		if (strong === 'L') return 'ltr';
		if (strong === 'R') return 'rtl';
	}
	return 'ltr';
}

const _RAPIER_DIR_BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,ul,ol,dt,dd,td,th';

function _rapierAssignHeadingSlugs(root, selector, reserveExisting, taken, assigned) { return finish(_rapierAssignHeadingSlugsSteps(root, selector, reserveExisting, taken, assigned)); }

function* _rapierAssignHeadingSlugsSteps(root, selector = RAPIER_RENDERED_HEADING_SELECTOR, reserveExisting = true, taken = null, assigned = null) {
	if (!root || !root.querySelectorAll) return;
	const used = taken || Object.create(null);
	const headings = _rapierDormantHeadings(root, selector, true);
	if (assigned && assigned.length !== headings.length) {
		try { console.warn('[rapier-reader] Part heading facts do not match its rendered headings; assigning ordinary heading IDs.'); } catch (_) {}
		assigned = null;
	}
	const headingSet = new Set(headings);
	if (reserveExisting) for (const element of _rapierDormantHeadings(root.isConnected ? document : root, '[id]', true)) { yield;
		if (!headingSet.has(element) && element.id) used[element.id] = 0;
	}
	let index = 0;
	for (const heading of headings) { yield;
		if (assigned) { heading.id = assigned[index++]; continue; }
		const base = _rapierHeadingSlugBase(heading.textContent);
		const owned = typeof _rapierChromeOwnsId === 'function' && _rapierChromeOwnsId(base);
		heading.id = _rapierNextHeadingSlug(owned ? 'heading-' + base : base, used);
	}
}

function _rapierDisambiguateRenderedAnchors(root) { return finish(_rapierDisambiguateRenderedAnchorsSteps(root)); }

function* _rapierDisambiguateRenderedAnchorsSteps(root) {
	if (!root || !root.querySelectorAll) return;
	const headings = new Set(_rapierDormantHeadings(root, RAPIER_RENDERED_HEADING_SELECTOR, true));
	const candidates = _rapierDormantHeadings(root, '[id]', true)
		.filter(element => !headings.has(element));
	for (const element of candidates) { yield;
		const original = _rapierRenderedAnchorOriginalIds.get(element);
		if (original) element.id = original;
	}

	const groups = new Map();
	for (const element of candidates) { yield;
		if (!element.id) continue;
		if (!groups.has(element.id)) groups.set(element.id, []);
		groups.get(element.id).push(element);
	}
	const used = new Set(Array.from(headings).map(heading => heading.id).filter(Boolean));
	const allocate = original => {
		const compact = String(original || '').replace(/[^a-z0-9_-]+/gi, '-')
			.replace(/^-+|-+$/g, '') || 'anchor';
		let next = 'rapier-anchor-' + compact;
		let suffix = 2;
		while (used.has(next) || groups.has(next)) {
			next = 'rapier-anchor-' + compact + '-' + suffix++;
		}
		used.add(next);
		return next;
	};

	const indexes = new Map();
	const add = (map, key, link) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(link); };
	for (const selector of ['.footnote-ref a[href^="#"]', '.footnote-backref[href^="#"]']) {
		const index = {hash: new Map(), label: new Map(), order: new Map()};
		for (const link of _rapierDormantHeadings(root, selector, true)) {
			index.order.set(link, index.order.size);
			add(index.hash, _rapierDecodeHash(link.getAttribute('href')), link);
			add(index.label, link.getAttribute('data-footnote-label'), link);
			yield;
		}
		indexes.set(selector, index);
	}
	const moveLink = (link, id) => {
		const before = _rapierDecodeHash(link.getAttribute('href'));
		link.setAttribute('href', '#' + id);
		const after = _rapierDecodeHash(link.getAttribute('href'));
		for (const index of indexes.values()) if (index.order.has(link)) {
			index.hash.get(before)?.delete(link); add(index.hash, after, link);
		}
	};
	for (const [original, elements] of groups.entries()) { yield;
		const explicitFootnotes = elements.filter(element =>
			element.classList.contains('footnote-item') && element.hasAttribute('data-footnote-label'));
		const footnoteRefs = elements.filter(element =>
			element.closest && element.closest('.footnote-ref'));
		const winner = explicitFootnotes.length
			? explicitFootnotes[explicitFootnotes.length - 1]
			: (footnoteRefs[0] || elements[0]);
		const winnerId = used.has(original) ? allocate(original) : original;
		if (!used.has(winnerId)) used.add(winnerId);
		winner.id = winnerId;
		if (winnerId !== original) _rapierRenderedAnchorOriginalIds.set(winner, original);

		for (const element of elements) { yield;
			if (element === winner) continue;
			const alias = allocate(original);
			element.id = alias;
			_rapierRenderedAnchorOriginalIds.set(element, original);
		}

		const labels = new Set(elements.map(element => element.getAttribute('data-footnote-label'))
			.filter(label => label != null));
		const matchingHashLinks = selector => {
			const index = indexes.get(selector), links = new Set(index.hash.get(original));
			for (const label of labels) for (const link of index.label.get(label) || []) links.add(link);
			return [...links].sort((a, b) => index.order.get(a) - index.order.get(b));
		};
		if (elements.some(element => element.classList.contains('footnote-item'))) {
			for (const link of matchingHashLinks('.footnote-ref a[href^="#"]')) { yield;moveLink(link, winnerId);}
		} else if (elements.some(element => element.closest && element.closest('.footnote-ref'))) {
			for (const link of matchingHashLinks('.footnote-backref[href^="#"]')) { yield;moveLink(link, winnerId);}
		}
	}
}

function _rapierDecodeHash(hash) {
	let raw = String(hash || '').replace(/^#/, '');
	const own = /^[dnv]\/[^/]*(?:\/(.*))?$/.exec(raw);
	if (own) raw = own[1] || '';
	try { return decodeURIComponent(raw); }
	catch (_) { return raw; }
}

function _rapierDecorateJumpLists(root, carry) { return finish(_rapierDecorateJumpListsSteps(root, carry)); }

function* _rapierDecorateJumpListsSteps(root, carry = null) {
	for (const list of root.querySelectorAll('ul')) { yield;
		if (list.closest('li')) continue;
		const items = Array.from(list.children).filter(item => item.tagName === 'LI');
		if (items.length < 2 || items.length !== list.children.length) continue;
		const isWayfinder = items.every(item => {
			if (item.querySelector('ul,ol')) return false;
			const links = Array.from(item.querySelectorAll(':scope > a[href^="#"]'));
			if (links.length !== 1) return false;
			const clone = item.cloneNode(true);
			clone.querySelectorAll('a').forEach(link => link.replaceWith(...link.childNodes));
			return String(clone.textContent || '').replace(/\s+/g, ' ').trim() ===
				String(links[0].textContent || '').replace(/\s+/g, ' ').trim();
		});
		if (isWayfinder) {
			list.classList.add('rapier-jump-list');
			const label = list.previousElementSibling;
			if (label && /^(?:jump\s+to|contents|table\s+of\s+contents):?$/i.test(String(label.textContent || '').trim())) {
				label.classList.add('rapier-jump-label');
			}
		}
	}

	const first = root.firstElementChild, only = !carry && first && !first.nextElementSibling ? first : null;
	if (only && only.tagName === 'P' && /^(?:jump\s+to|contents|table\s+of\s+contents):?$/i.test(String(only.textContent || '').trim())) {
		only.classList.add('rapier-jump-label-candidate');
	}
}

function _rapierMarkFigureCaptions(root) { return finish(_rapierMarkFigureCaptionsSteps(root)); }

function* _rapierMarkFigureCaptionsSteps(root) {
	const figureCaption = /^Figure: /;
	for (const paragraph of root.querySelectorAll('p')) { yield;
		if (!figureCaption.test(paragraph.textContent || '')) continue;
		const previous = paragraph.previousElementSibling;
		if (!previous || previous.tagName !== 'P') continue;
		const images = previous.querySelectorAll('img');
		if (images.length !== 1 || previous.textContent.trim()) continue;
		paragraph.classList.add('rapier-figure-caption');
	}
}

function _rapierMarkListContinuations(blocks, mark) { return finish(_rapierMarkListContinuationsSteps(blocks, mark)); }

function* _rapierChildElements(root) {
	for (let child = root.firstElementChild; child; child = child.nextElementSibling) yield child;
}

function* _rapierMarkListContinuationsSteps(blocks, mark = (element, name) => element.setAttribute(name, '')) {
	const isHeading = element => !!element && /^H[1-6]$/.test(element.tagName);
	let previous = null, headings = [], last = 0;
	for (const element of blocks) { yield;
		if (previous && isHeading(element)) {headings.push(element); continue;}
		if (!element || element.tagName !== 'OL') {previous = null; headings = []; continue;}
		const start = parseInt(element.getAttribute('start'), 10);
		if (previous && headings.length && start === last + 1) {
			mark(previous, 'data-rapier-list-continues');
			for (const heading of headings) { yield;mark(heading, 'data-rapier-list-through');}
		}
		previous = element; headings = [];
		last = (Number.isFinite(start) ? start : 1) + element.querySelectorAll(':scope > li').length - 1;
	}
}

function _rapierMarkTableCaptions(root, carry) { return finish(_rapierMarkTableCaptionsSteps(root, carry)); }

function* _rapierMarkTableCaptionsSteps(root, carry = null) {
	const used = new Set(Array.from(root.querySelectorAll('[id]'), element => element.id));
	let ordinal = carry?.captions || 0;
	for (const table of root.querySelectorAll('table')) { yield;
		const sibling = table.nextElementSibling;
		if (!sibling || sibling.tagName !== 'P') continue;
		if (!RAPIER_TABLE_CAPTION_PREFIX_RE.test(sibling.textContent || '')) continue;
		sibling.classList.add('rapier-table-caption');
		let id;
		do { id = 'rapier-table-caption-' + (++ordinal); } while (used.has(id));
		used.add(id);
		sibling.id = id;
		const existing = (table.getAttribute('aria-describedby') || '').trim();
		table.setAttribute('aria-describedby', existing ? existing + ' ' + id : id);
	}
	if (carry) carry.captions = ordinal;
}



function _rapierNormalizeCodeElement(code) {
	const lang = _rapierLanguageClass(code);
	code.replaceChildren(document.createTextNode(code.textContent || ''));
	code.removeAttribute('class');
	if (lang) code.className = 'language-' + lang;
}

function _rapierLanguageClass(element) {
	if (!element || !element.classList) return '';
	const found = Array.from(element.classList).find(name => /^language-.+/i.test(name));
	return found ? found.slice(9) : '';
}

function _relabelFootnoteHtml(html, labels) {
	if (!labels || !labels.length) return html;
	const info = n => {
		const label = labels[n - 1];
		return label ? {
			id: _footnoteIdFromLabel(label),
			label: escapeRapierHtmlText(label),
		} : null;
	};
	return html
		.replace(/id="fnref(\d+)(:\d+)?"/g, (m0, n, dup) => {
			const item = info(+n);
			return item
				? 'id="fnref-' + item.id + (dup ? dup.replace(':', '-') : '') + '" data-footnote-label="' + item.label + '"'
				: m0;
		})
		.replace(/href="#fnref(\d+)(:\d+)?"/g, (m0, n, dup) => {
			const item = info(+n);
			return item ? 'href="#fnref-' + item.id + (dup ? dup.replace(':', '-') : '') + '"' : m0;
		})
		.replace(/id="fn(\d+)"/g, (m0, n) => {
			const item = info(+n);
			return item
				? 'id="fn-' + item.id + '" data-footnote-label="' + item.label + '"'
				: m0;
		})
		.replace(/href="#fn(\d+)"/g, (m0, n) => {
			const item = info(+n);
			return item ? 'href="#fn-' + item.id + '"' : m0;
		});
}

function _footnoteIdFromLabel(label) {
	return String(label).replace(/[^A-Za-z0-9_-]/g,
		c => '_' + c.charCodeAt(0).toString(16));
}

function wrapDisplayMath(html) {
	if (!html) return html;
	if (/class=["'][^"']*\bmath-display-wrap\b/i.test(html)) return html;
	return '<span class="math-display-wrap">' + html + '</span>';
}

function _rapierCalloutInfo(blockquote) {
	const first = blockquote && blockquote.querySelector(':scope > p:first-child');
	if (!first) return null;
	const existing = first.querySelector('.callout__label');
	if (existing) {
		const type = String(existing.textContent || '').trim().toUpperCase();
		return /^(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER|INFO)$/.test(type) ? { first, type, existing } : null;
	}
	const match = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER|INFO)\]/i.exec(first.textContent || '');
	return match ? { first, type: match[1].toUpperCase(), existing: null } : null;
}

function _rapierRemoveCalloutMarker(first) {
	if (!first) return;
	first.innerHTML = first.innerHTML.replace(
		/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER|INFO)\]\s*(?:<br\s*\/?>)?\s*/i,
		''
	);
}

const mathSource = /^\$\$[\s\S]+\$\$$|^\$[^$\n]+\$$/;

function _rapierMathSource(node) {
	if (!node) return '';
	const carrier = node.matches && node.matches('[data-math-src]')
		? node
		: node.querySelector && node.querySelector('[data-math-src]');
	if (carrier) {
		const encoded = carrier.getAttribute('data-math-src') || '';
		try { return decodeURIComponent(encoded); } catch (_) { return encoded; }
	}
	const placeholder = node.matches && node.matches('.math-placeholder')
		? node
		: node.querySelector && node.querySelector('.math-placeholder');
	return String((placeholder || node).textContent || '').trim();
}

function _rapierFlattenPortableDetails(root) { return finish(_rapierFlattenPortableDetailsSteps(root)); }

function* _rapierFlattenPortableDetailsSteps(root) {
	const blockTags = new Set([
		'ADDRESS','ARTICLE','ASIDE','BLOCKQUOTE','DIV','DL','FIELDSET','FIGURE',
		'FOOTER','FORM','H1','H2','H3','H4','H5','H6','HEADER','HR','MAIN',
		'NAV','OL','P','PRE','SECTION','TABLE','UL',
	]);
	for (const details of Array.from(root.querySelectorAll('details')).reverse()) { yield;
		const summary = Array.from(details.children).find(child => child.tagName === 'SUMMARY');
		const section = document.createElement('section');
		if (details.id) section.id = details.id;
		if (summary && (summary.textContent.trim() || summary.children.length)) {
			const heading = summary.querySelector('h1,h2,h3,h4,h5,h6');
			const label = document.createElement(heading ? 'div' : 'p');
			if (summary.id) label.id = summary.id;
			const content = heading ? label : document.createElement('strong');
			while (summary.firstChild) content.appendChild(summary.firstChild);
			if (!heading) label.appendChild(content);
			section.appendChild(label);
		}

		let paragraph = null;
		for (const child of Array.from(details.childNodes)) { yield;
			if (child === summary) continue;
			const isText = child.nodeType === Node.TEXT_NODE;
			if (isText && !String(child.nodeValue || '').trim()) continue;
			const isBlock = child.nodeType === Node.ELEMENT_NODE && blockTags.has(child.tagName);
			if (!isBlock) {
				if (!paragraph) {
					paragraph = document.createElement('p');
					section.appendChild(paragraph);
				}
				paragraph.appendChild(child);
				continue;
			}
			paragraph = null;
			section.appendChild(child);
		}
		details.replaceWith(section);
	}
}

function _rapierProjectPortableRoot(semanticRoot, options) { return finish(_rapierProjectPortableRootSteps(semanticRoot, options)); }
async function _rapierProjectPortableRootAsync(semanticRoot, options = {}) { return finishAsync(_rapierProjectPortableRootSteps(semanticRoot, options), options.work); }

function* _rapierProjectPortableRootSteps(semanticRoot, options) {
	const root = yield* _rapierProjectPortableNodesSteps(semanticRoot, options);
	return yield* cleanTree(root, sanitizeRapierHtml, 'export', runtime.sanitizeRapierFragment);
}

function* _rapierProjectPortableNodesSteps(semanticRoot, options) {
	const opts = options || {};
	const keepLayoutData = !!opts.keepLayoutData;
	const root = opts.inPlace ? semanticRoot : yield* cloneTree(semanticRoot), nativeElements = new Set();
	yield* _rapierResolveSoftBreakTokensSteps(root);
	if (opts.keepMath) for (const math of root.querySelectorAll('.math-rendered[data-math-src],.math-placeholder,[data-rapier-math-source]')) {
		for (const element of [math, ...math.querySelectorAll('*')]) nativeElements.add(element);
	}
	if (opts.keepDiagrams) for (const figure of root.querySelectorAll('.diagram-block[data-diagram-native]')) {
		const svg = figure.querySelector('.diagram-cache > svg.rapier-native-flowchart');
		if (figure.getAttribute('data-diagram-state') === 'ready' && svg) {
			for (const element of [svg, ...svg.querySelectorAll('*')]) nativeElements.add(element);
			figure.replaceWith(svg);
		}
	}

	for (const blockquote of root.querySelectorAll('blockquote')) { yield;
		const info = _rapierCalloutInfo(blockquote);
		if (!info) continue;
		if (info.existing) info.existing.remove();
		else _rapierRemoveCalloutMarker(info.first);
		const label = document.createElement('strong');
		label.textContent = info.type.charAt(0) + info.type.slice(1).toLowerCase() + ': ';
		info.first.insertBefore(label, info.first.firstChild);
	}

	for (const input of root.querySelectorAll('input[type="checkbox"]')) { yield;
		const nextStartsWithSpace = input.nextSibling
			&& input.nextSibling.nodeType === Node.TEXT_NODE
			&& /^\s/.test(input.nextSibling.nodeValue || '');
		input.replaceWith(document.createTextNode((input.checked ? '☒' : '☐') + (nextStartsWithSpace ? '' : ' ')));
	}

	for (const wrapper of root.querySelectorAll('.math-display-wrap')) { yield;
		if (opts.keepMath && wrapper.querySelector('.math-rendered,.math-placeholder,[data-rapier-math-source]')) {
			const paragraph = document.createElement('p');
			paragraph.setAttribute('data-md-align', 'center');
			while (wrapper.firstChild) paragraph.appendChild(wrapper.firstChild);
			wrapper.replaceWith(paragraph);
			continue;
		}
		const source = _rapierMathSource(wrapper);
		const p = document.createElement('p');
		const code = document.createElement('code');
		code.textContent = source || '[equation]';
		p.appendChild(code);
		wrapper.replaceWith(p);
	}
	for (const math of root.querySelectorAll('.math-rendered,.math-placeholder')) { yield;
		if (nativeElements.has(math)) continue;
		const code = document.createElement('code');
		code.textContent = _rapierMathSource(math) || '[equation]';
		math.replaceWith(code);
	}
	for (const math of root.querySelectorAll('math')) { yield;
		if (keepLayoutData) {
			for (const element of [math, ...math.querySelectorAll('*')]) nativeElements.add(element);
			continue;
		}
		const code = document.createElement('code');
		code.textContent = String(math.textContent || '').trim() || '[equation]';
		math.replaceWith(code);
	}

	if (!keepLayoutData) yield* _rapierFlattenPortableDetailsSteps(root);

	for (const section of root.querySelectorAll('section.footnotes')) { yield;
		for (const node of section.querySelectorAll('.footnotes-sep')) { yield;node.remove();}
		if (!section.querySelector(':scope > h1,:scope > h2,:scope > h3')) {
			const heading = document.createElement('h2');
			heading.textContent = 'Footnotes';
			section.insertBefore(heading, section.firstChild);
		}
	}

	for (const item of root.querySelectorAll('.table-scroll-wrap,.math-display-wrap')) { yield; _rapierUnwrapElement(item); }

	if (!keepLayoutData) for (const item of root.querySelectorAll('pre > code')) { yield; _rapierNormalizeCodeElement(item); }

	for (const svg of root.querySelectorAll('svg')) { yield;
		if (nativeElements.has(svg)) continue;
		const title = svg.getAttribute('aria-label')
			|| (svg.querySelector('title') && svg.querySelector('title').textContent)
			|| '';
		svg.replaceWith(document.createTextNode(title ? '[Image: ' + title.trim() + ']' : '[Image]'));
	}

	if (runtime.prefixAnchorsSteps) yield* runtime.prefixAnchorsSteps(root, opts.baseName);
	else _rapierPrefixPortableAnchors(root, opts.baseName);

	const refinedProse = [];
	for (const element of root.querySelectorAll('*')) { yield;
		if (nativeElements.has(element)) continue;
		const lang = element.tagName === 'CODE' ? _rapierLanguageClass(element) : '';
		const footnoteRole = keepLayoutData ? ['footnote-backref', 'footnotes-sep']
			.filter(name => element.classList.contains(name)).join(' ') : '';
		const captionRole = keepLayoutData ? ['rapier-table-caption', 'rapier-figure-caption']
			.filter(name => element.classList.contains(name)).join(' ') : '';
		const columnAlignment = /^(TH|TD)$/.test(element.tagName) && /^(left|center|right)$/.test(element.style.textAlign)
			? element.style.textAlign : '';
		const paragraphLayout = globalThis.RapierMarkdownLayout.parseLayoutAttribute(element.getAttribute('data-md-layout'));
		const alignment = paragraphLayout?.align || columnAlignment;
		const imageLayout = element.tagName === 'IMG' ? globalThis.RapierMarkdownLayout.parseLayoutAttribute(element.getAttribute('data-rapier-image-layout')) : null;
		const measurements = keepLayoutData && /^(?:P|H[1-6]|LI|OL|UL)$/.test(element.tagName)
			? ['text-indent', 'margin-inline-start', 'margin-top', 'margin-bottom', 'line-height'].map(property => [property, element.style.getPropertyValue(property)]) : [];
		if (keepLayoutData && element.tagName === 'P' && element.closest('table') && element.style.getPropertyValue('hyphens').trim() === 'auto')
			measurements.push(['hyphens', 'auto']);
		if (keepLayoutData && element.closest('pre')) for (const property of ['color', 'font-weight', 'font-style'])
			measurements.push([property, element.style.getPropertyValue(property)]);
		if (keepLayoutData && element.tagName === 'BLOCKQUOTE')
			measurements.push(['border-inline-start-color', element.style.borderInlineStartColor]);
		const runTypography = keepLayoutData ? ['font-family', 'font-variant-caps'].map(property => [property, element.style.getPropertyValue(property)]) : [];

		const typed = globalThis.RapierMarkdownSpec.typography, typography = typed.nodeStyle(element);

		if (keepLayoutData && element.tagName === 'MARK' && !element.style.backgroundColor && !element.hasAttribute('data-rapier-highlight'))
			element.setAttribute('data-rapier-highlight', 'default');
		const highlightHex = element.tagName === 'MARK'
			? (element.style.backgroundColor || RAPIER_PORTABLE_HIGHLIGHT_HEX[String(element.getAttribute('data-rapier-highlight') || '').toLowerCase()] || RAPIER_PORTABLE_HIGHLIGHT_HEX.yellow)
			: null;

		const isTableCaption = element.tagName === 'P' && (element.classList.contains('rapier-table-caption') || element.classList.contains('rapier-figure-caption'));

		const isPageBreak = element.hasAttribute('data-md-break');
		for (const attribute of Array.from(element.attributes)) { yield;
			const name = attribute.name.toLowerCase();
			if (opts.heldPictures && /^(?:SPAN|IMG)$/.test(element.tagName) &&
					(name === 'data-rapier-remote-src' || name === 'data-rapier-remote-alt')) continue;
			if (keepLayoutData && (name === 'data-rapier-image-layout' || name === 'data-md-layout' || name === 'data-md-align' || name === 'data-rapier-ink'
					|| name === 'data-md-first-line-end' || name === 'data-md-initial-font' || name === 'data-md-initial-size'
					|| name === 'data-md-picture-cap-height' || name === 'data-md-picture-cap-top' || name === 'data-rapier-highlight' || name === 'data-rapier-animation'
					|| name === 'data-rapier-list-ordinal' || name === 'data-rapier-list-delimiter' || name === 'data-md-layout-tight')) continue;
			if (name === 'class' || name === 'style' || name.startsWith('data-')
					|| name === 'contenteditable' || name === 'spellcheck'
					|| name === 'tabindex' || name === 'disabled' || name === 'aria-disabled') {
				element.removeAttribute(attribute.name);
			}
		}
		if (footnoteRole) element.className = footnoteRole;
		if (captionRole) element.className = captionRole;
		if (lang) element.className = 'language-' + lang;
		for (const [property, value] of measurements) if (value) element.style.setProperty(property, value);
		for (const [property, value] of runTypography) if (value) element.style.setProperty(property, value);
		if (alignment) element.style.textAlign = alignment;
		if (paragraphLayout && /^(?:P|H[1-6])$/.test(element.tagName)) {
			if (paragraphLayout.line != null) element.style.lineHeight = String(paragraphLayout.line).replace(/\+$/, '');
			if (paragraphLayout.before != null) element.style.marginTop = paragraphLayout.before + 'pt';
			if (paragraphLayout.after != null) element.style.marginBottom = paragraphLayout.after + 'pt';
		}
		if (!keepLayoutData && paragraphLayout && /^(?:P|H[1-6])$/.test(element.tagName) && !element.closest('table,pre') && (paragraphLayout.first != null || paragraphLayout.indent != null)) {
			const indents = {...(paragraphLayout.first != null && {first: paragraphLayout.first}), ...(paragraphLayout.indent != null && {indent: paragraphLayout.indent})};
			for (const declaration of globalThis.RapierMarkdownLayout.textStyle(indents, {portable: true}).split(';').filter(Boolean)) {
				const at = declaration.indexOf(':');
				element.style.setProperty(declaration.slice(0, at), declaration.slice(at + 1));
			}
		}
		if (!keepLayoutData && element.tagName === 'P' && !element.closest('table,pre')) {
			if (paragraphLayout?.hyphens === 'auto') { element.style.hyphens = 'auto'; element.style.textWrap = 'pretty'; }
			if (paragraphLayout?.hanging === 'on') element.style.setProperty('hanging-punctuation', 'first allow-end');
			if (paragraphLayout?.hyphens || paragraphLayout?.hanging || paragraphLayout?.caps || paragraphLayout?.lines) refinedProse.push(element);
		}
		if (imageLayout && !keepLayoutData) {
			const pictureStyle = globalThis.RapierMarkdownLayout.imageStyle(imageLayout);
			if (imageLayout.width != null) element.removeAttribute('width');
			if (pictureStyle) element.style.cssText = pictureStyle;
		}
		if (highlightHex) element.style.backgroundColor = highlightHex;
		if (isTableCaption) { element.style.fontStyle = 'italic'; element.style.color = '#555555'; }
		const css = typed.style(typography);
		if (css) element.setAttribute('style', (element.getAttribute('style') ? element.getAttribute('style') + ';' : '') + css);

		if (isPageBreak) {
			const p = document.createElement('p');
			p.setAttribute('style', 'page-break-before: always');
			element.replaceWith(p);
		}
	}
	for (const paragraph of refinedProse) for (const literal of paragraph.querySelectorAll('code,kbd,samp,math')) { yield;
		literal.style.setProperty('hyphens', 'none');
		literal.style.setProperty('text-justify', 'none');
		literal.style.setProperty('font-variant-caps', 'normal');
		literal.style.setProperty('hanging-punctuation', 'none');
	}

	return root;
}

function _rapierPortableHtml(root) {
	return sanitizeRapierHtml(root ? root.innerHTML : '', 'export').trim();
}
async function _rapierPortableHtmlAsync(root, work) { return finishAsync(serializeTree(root, sanitizeRapierHtml, true), work); }

async function _rapierClipboardPayloadAsync(canonical, metadata, options = {}) {
	const work = options.work;
	let semantic;
	const part = document.createElement('div');
	try {
		semantic = await _rapierRenderSemanticRootAsync(canonical, metadata, {work});
		if (options.formatted && options.materialize && await options.materialize(semantic) === false) return null;
		check(work);
		await finishAsync(_rapierProjectPortableNodesSteps(semantic,
			{baseName: options.baseName, inPlace: true, heldPictures: true}), work);
		const words = metadata.docKind === 'markdown' ? _rapierPortableTextWriter({heldPictures: true}) : null;
		const parts = [];
		let pictures = false;
		const plain = await finishAsync((function* () {
			for (const html of htmlParts(semantic, 16384, true)) {
				if (html === null) { yield; continue; }
				admitHtml(part, html, sanitizeRapierHtml, runtime.sanitizeRapierFragment);
				yield;
				if (words) yield* words.write(part);
				if (options.formatted) {
					for (const node of part.querySelectorAll('[data-rapier-remote-src],[data-rapier-remote-alt]')) {
						node.removeAttribute('data-rapier-remote-src'); node.removeAttribute('data-rapier-remote-alt'); yield;
					}
					pictures ||= !!part.querySelector('img[src^="data:"]');
					parts.push(yield* serializeTree(part));
				}
				part.replaceChildren(); yield;
			}
			return words ? yield* words.finish() : canonical;
		})(), work);
		check(work);
		if (!options.formatted) return {plain};
		return {plain, html: parts.join('').trim(), withoutPictures: pictures ? async () => {
			return finishAsync((function* () {
				const output = [], part = document.createElement('div');
				try {
					for (const html of parts) {
						if (!html.includes('<img')) { output.push(html); yield; continue; }
						part.innerHTML = html;
						let changed = false;
						for (const image of part.querySelectorAll('img[src^="data:"]')) {
							const replacement = document.createElement('span');
							replacement.textContent = '[image: ' + (String(image.getAttribute('alt') || 'image').trim() || 'image') + ']';
							image.replaceWith(replacement); changed = true; yield;
						}
						output.push(changed ? yield* serializeTree(part, sanitizeRapierHtml) : html);
						part.replaceChildren(); yield;
					}
					return output.join('').trim();
				} finally { part.replaceChildren(); }
			})(), work);
		} : null};
	} finally { semantic?.replaceChildren(); part.replaceChildren(); }
}

function _rapierNormalizeInlineText(value) {
	return String(value || '')
		.replace(/\u00a0/g, ' ')
		.replace(/[\t\f\v ]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.trim();
}

function _rapierPictureWords(alt, src) {
	if (/^data:image\//i.test(src)) return alt ? '[Image: ' + alt + ']' : '[Image]';
	if (src) return alt ? '[Image: ' + alt + ' — ' + src + ']' : '[Image: ' + src + ']';
	return alt ? '[Image: ' + alt + ']' : '[Image]';
}

function _rapierHeldPicturesAsWords(root) { return finish(_rapierHeldPicturesAsWordsSteps(root)); }
async function _rapierHeldPicturesAsWordsAsync(root, work) { return finishAsync(_rapierHeldPicturesAsWordsSteps(root), work); }

function* _rapierHeldPicturesAsWordsSteps(root) {
	const copy = yield* cloneTree(root);
	for (const held of copy.querySelectorAll('span[data-rapier-remote-src],img[data-rapier-remote-src]')) { yield;held.replaceWith(document.createTextNode(
		_rapierPictureWords(String(held.getAttribute('data-rapier-remote-alt') || '').trim(), String(held.getAttribute('data-rapier-remote-src') || '').trim())));}
	return copy;
}

function _rapierPortableInlineText(node, options) { return finish(_rapierPortableInlineTextSteps(node, options)); }

function* _rapierPortableInlineTextSteps(node, options) {
	const opts = options || {};
	if (!node) return '';
	yield;
	if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
	if (node.nodeType !== Node.ELEMENT_NODE) return '';
	const tag = node.tagName;
	if (opts.heldPictures && /^(?:SPAN|IMG)$/.test(tag) && node.hasAttribute('data-rapier-remote-src'))
		return _rapierPictureWords(String(node.getAttribute('data-rapier-remote-alt') || '').trim(),
			String(node.getAttribute('data-rapier-remote-src') || '').trim());
	if (tag === 'BR') return '\n';
	if (tag === 'INPUT') return /^checkbox$/i.test(node.type || '') ? (node.checked || node.hasAttribute('checked') ? '☑ ' : '☐ ') : '';
	if (tag === 'IMG') {
		if (opts.visible) return '';
		return _rapierPictureWords(String(node.getAttribute('alt') || '').trim(), String(node.getAttribute('src') || '').trim());
	}
	if (tag === 'CODE' && !opts.inPre) {
		const source = String(node.textContent || '');
		return opts.visible || mathSource.test(source) ? source : source ? '`' + source + '`' : '';
	}
	const parts = [];
	for (let child = node.firstChild; child; child = child.nextSibling) parts.push(yield* _rapierPortableInlineTextSteps(child, opts));
	const text = parts.join('');
	if (tag === 'A') {
		const label = _rapierNormalizeInlineText(text), href = String(node.getAttribute('href') || '').trim();
		if (opts.visible || !href || href.charAt(0) === '#') return label;
		if (!label || label === href) return href;
		return label + ' (' + href + ')';
	}
	return text;
}

function _rapierPortableListText(list, depth, options) { return finish(_rapierPortableListTextSteps(list, depth, options)); }

function* _rapierPortableListTextSteps(list, depth, options) {
	const opts = options || {}, level = Math.max(0, depth | 0), ordered = list.tagName === 'OL';
	let counter = ordered ? (parseInt(list.getAttribute('start'), 10) || 1) : 0;
	const lines = [];
	for (let item = list.firstElementChild; item; item = item.nextElementSibling) {
		yield;
		if (item.tagName !== 'LI') continue;
		const nested = [], content = [];
		for (let child = item.firstChild; child; child = child.nextSibling) {
			if (child.nodeType === Node.ELEMENT_NODE && (child.tagName === 'UL' || child.tagName === 'OL')) nested.push(child);
			else content.push(yield* _rapierPortableInlineTextSteps(child, opts));
		}
		const normalized = _rapierNormalizeInlineText(content.join('')), indent = '  '.repeat(level);
		const marker = /^[☐☑☒]/.test(normalized) ? '' : ordered ? (counter++) + '. ' : '• ';
		const parts = normalized.split('\n');
		lines.push(indent + marker + (parts.shift() || ''));
		for (const part of parts) { lines.push(indent + '  ' + part); yield; }
		for (const child of nested) {
			const text = yield* _rapierPortableListTextSteps(child, level + 1, opts);
			if (text) lines.push(text);
		}
	}
	return lines.join('\n');
}

function _rapierPortableTableText(table, options) { return finish(_rapierPortableTableTextSteps(table, options)); }

function* _rapierPortableTableTextSteps(table, options) {
	const opts = options || {}, rows = [];
	const walker = document.createTreeWalker(table, 1 );
	let row = table.tagName === 'TR' ? table : walker.nextNode();
	while (row) {
		yield;
		if (row.tagName === 'TR') {
			const cells = [];
			for (let cell = row.firstElementChild; cell; cell = cell.nextElementSibling) {
				if (cell.tagName === 'TH' || cell.tagName === 'TD')
					cells.push(_rapierNormalizeInlineText(yield* _rapierPortableInlineTextSteps(cell, opts)));
			}
			const text = cells.join(opts.visible ? '\t' : ' | ');
			if (text) rows.push(text);
		}
		row = table.tagName === 'TR' ? null : walker.nextNode();
	}
	return rows.join('\n');
}

function _rapierPortablePlainText(root, options) { return finish(_rapierPortablePlainTextSteps(root, options)); }
async function _rapierPortablePlainTextAsync(root, options = {}) { return finishAsync(_rapierPortablePlainTextSteps(root, options), options.work); }

function* _rapierPortablePlainTextSteps(root, options) {
	const writer = _rapierPortableTextWriter(options);
	yield* writer.write(root);
	return yield* writer.finish();
}

function _rapierPortableTextWriter(options) {
	const opts = options || {};
	const blocks = [];
	const blockTags = new Set([
		'ADDRESS','ARTICLE','ASIDE','BLOCKQUOTE','DETAILS','DIV','DL','FIELDSET','FIGCAPTION','FIGURE','FOOTER',
		'FORM','H1','H2','H3','H4','H5','H6','HEADER','HR','MAIN','NAV','OL','P','PRE','SECTION','TABLE','UL'
	]);

	const pushBlock = (text, preserve) => {
		let value = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
		if (preserve) value = value.replace(/\n+$/, '');
		else value = value.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
		if (value) blocks.push({ text: value, preserve: !!preserve });
	};

	const state = () => ({inline: [], table: null});
	const flush = current => {
		if (current.inline.length) {
			pushBlock(_rapierNormalizeInlineText(current.inline.join('')), false);
			current.inline = [];
		}
		if (current.table) {
			pushBlock(current.table.filter(Boolean).join('\n'), false);
			current.table = null;
		}
	};
	const collectChildren = function* (parent, current = state(), complete = true) {
		const tablePart = node => node.nodeType === Node.ELEMENT_NODE && /^(THEAD|TBODY|TFOOT|TR)$/.test(node.tagName);
		const blankText = node => node.nodeType === Node.TEXT_NODE && !String(node.nodeValue || '').trim();
		for (let child = parent.firstChild; child; child = child.nextSibling) {
			yield;
			if (tablePart(child)) {
				if (!current.table) { flush(current); current.table = []; }
				current.table.push(yield* _rapierPortableTableTextSteps(child, opts));
				continue;
			}
			if (current.table && blankText(child)) continue;
			if (current.table) flush(current);
			if (child.nodeType === Node.ELEMENT_NODE && blockTags.has(child.tagName)) {
				flush(current);
				yield* collectBlock(child);
			} else if (opts.visible && child.nodeType === Node.ELEMENT_NODE && child.tagName === 'CODE' && String(child.textContent || '').includes('\n')) {
				flush(current);
				pushBlock(String(child.textContent || ''), true);
			} else current.inline.push(yield* _rapierPortableInlineTextSteps(child, opts));
		}
		if (complete) flush(current);
	};

	const collectBlock = function* (node) {
		if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
		const tag = node.tagName;
		if (/^H[1-6]$/.test(tag) || tag === 'P') {
			const text = _rapierNormalizeInlineText(yield* _rapierPortableInlineTextSteps(node, opts));
			if (tag === 'P' && !text && node.childNodes.length && !node.hasAttribute('data-md-break')) blocks.push({ text: '', blank: true });
			else pushBlock(text, false);
			return;
		}
		if (tag === 'HR') { pushBlock('────────', false); return; }
		if (tag === 'PRE') {
			const code = node.querySelector(':scope > code') || node;
			const lang = _rapierLanguageClass(code);
			const source = String(code.textContent || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
			if (opts.visible) { pushBlock(source, true); return; }
			const label = lang ? lang.charAt(0).toUpperCase() + lang.slice(1) + ':\n\n' : '';
			pushBlock(label + source.split('\n').map(line => '    ' + line).join('\n'), true);
			return;
		}
		if (tag === 'UL' || tag === 'OL') {
			pushBlock(yield* _rapierPortableListTextSteps(node, 0, opts), false);
			return;
		}
		if (tag === 'TABLE') {
			pushBlock(yield* _rapierPortableTableTextSteps(node, opts), false);
			return;
		}
		if (tag === 'BLOCKQUOTE') {
			const before = blocks.length;
			yield* collectChildren(node);
			const quoted = blocks.splice(before).filter(block => !block.blank).map(block => block.text).join('\n\n');
			if (quoted) pushBlock(opts.visible ? quoted : quoted.split('\n').map(line => line ? '> ' + line : '>').join('\n'), true);
			return;
		}
		if (tag === 'DL') {
			const children = Array.from(node.children);
			for (let i = 0; i < children.length; i++) {
				if (children[i].tagName !== 'DT') continue;
				const term = _rapierNormalizeInlineText(yield* _rapierPortableInlineTextSteps(children[i], opts));
				const defs = [];
				while (children[i + 1] && children[i + 1].tagName === 'DD') {
					defs.push(_rapierNormalizeInlineText(yield* _rapierPortableInlineTextSteps(children[++i], opts)));
				}
				pushBlock(term + (defs.length ? ' — ' + defs.join('\n  ') : ''), false);
			}
			return;
		}
		if (tag === 'DETAILS') {
			const summary = node.querySelector(':scope > summary');
			if (summary) pushBlock(_rapierNormalizeInlineText(yield* _rapierPortableInlineTextSteps(summary, opts)), false);
			for (const child of node.children) if (child !== summary) { yield; yield* collectBlock(child); }
			return;
		}
		yield* collectChildren(node);
	};

	const pending = state();
	return {write: root => collectChildren(root, pending, false), finish: function* () {
	flush(pending);
	let joined = '', blanks = 0;
	for (const block of blocks) {
		yield;
		if (block.blank) { blanks++; continue; }
		joined += (joined ? '\n\n' + '\n'.repeat(blanks) : '') + block.text;
		blanks = 0;
	}
	const text = joined.trim();
	return opts.finalNewline && text ? text + '\n' : text;
	}};
}

function _rapierPlainTextFile(context) {
	return context.metadata.docKind === 'markdown'
		? _rapierPortablePlainText(_rapierProjectPortableRoot(_rapierHeldPicturesAsWords(context.semanticRoot), { baseName: context.baseName }), { finalNewline: true })
		: context.canonical;
}

async function _rapierPlainTextFileAsync(context) {
	if (context.metadata.docKind !== 'markdown') return context.canonical;
	const work = context.work;
	const root = await _rapierHeldPicturesAsWordsAsync(context.semanticRoot, work);
	const portable = await _rapierProjectPortableRootAsync(root, {baseName: context.baseName, work});
	return _rapierPortablePlainTextAsync(portable, {finalNewline: true, work});
}

async function _rapierCloneRootAsync(root, work) { return finishAsync(cloneTree(root), work); }

function _rapierSourceTokenValue(node) {
	if (!node?.hasAttribute('data-rapier-source') || !node.hasAttribute('data-rapier-visible')) return null;
	try {
		const source = decodeURIComponent(node.getAttribute('data-rapier-source'));
		if (node.classList.contains('rapier-source-token--wiki') || node.classList.contains('rapier-source-token--wiki-embed')) {
			const token = md.parseInline(source, {rapierWikiLinks: 'links'})[0]?.children;
			if (token?.length !== 1 || token[0].type !== 'rapier_wiki') return null;
			if (!node.hasAttribute('data-rapier-wiki-ready') && (node.children.length !== 1 || node.firstElementChild.tagName !== 'A' ||
				node.firstElementChild.getAttribute('href') !== wikiAddress(token[0].meta.target))) return null;
		} else if (Array.from(node.childNodes).some(child => child.nodeType !== Node.TEXT_NODE)) return null;
		return node.textContent === decodeURIComponent(node.getAttribute('data-rapier-visible'))
			? source : null;
	} catch (_) { return null; }
}

function _rapierResolveSoftBreakTokens(root) { return finish(_rapierResolveSoftBreakTokensSteps(root)); }

function* _rapierResolveSoftBreakTokensSteps(root) {
	for (const token of root.querySelectorAll('.rapier-source-token--softbreak')) { yield;
		if (_rapierSourceTokenValue(token) === '\n') token.replaceWith(document.createTextNode(token.closest('pre') ? '\n' : ' '));
		else token.replaceWith(...token.childNodes);
	}
	return root;
}

function _rapierInertParse(markups) {
	const doc = new DOMParser().parseFromString(markups.map((html, at) => '<div data-rapier-batch="' + at + '">' + html + '</div>').join(''), 'text/html');
	const boxes = [...doc.body.childNodes];
	const intact = boxes.length === markups.length && boxes.every((box, at) => box.getAttribute?.('data-rapier-batch') === String(at));
	return {doc, boxes: intact ? boxes : null};
}

function _rapierUnwrapElement(element) {
	while (element.firstChild) element.parentNode.insertBefore(element.firstChild, element);
	element.remove();
}

function _rapierBidiStrong(cp) {
	const ch = String.fromCodePoint(cp);
	if (/\p{Nd}/u.test(ch)) return null;
	if (_RAPIER_RTL_SCRIPT.test(ch)) return 'R';
	if (/\p{L}/u.test(ch)) return 'L';
	return null;
}

function renderWithMathML(source, metadata = {}) {
	const provider = _rapierProviders.math;
	if (!provider || provider.status !== 'ready' || typeof provider.renderToString !== 'function' ||
		typeof provider.renderWithMathML !== 'function')
		throw new Error('The Rapier Math shared-result renderer is unavailable.');
	if (!md) initMarkdownIt();
	const equations = [];
	const html = _rapierRenderSemanticRoot(source, metadata, {mathEquations: equations}).innerHTML;
	return {html, equations};
}

  return {_rapierReadPartDecorations, renderWithMathML, _rapierClipboardPayloadAsync, _rapierPlainTextFileAsync, _rapierCloneRootAsync, _rapierPortablePlainTextAsync, _rapierHeldPicturesAsWordsAsync, _rapierRenderSemanticRootAsync, _rapierProjectPortableRootAsync, _rapierPortableHtmlAsync, _rapierCalloutInfo, _rapierRemoveCalloutMarker, _rapierMathSource, _rapierFlattenPortableDetails, _rapierProjectPortableRoot, _rapierPortableHtml, _rapierNormalizeInlineText, _rapierPortableInlineText, _rapierPortableListText, _rapierPortableTableText, _rapierPortablePlainText, _rapierPlainTextFile, _rapierHeldPicturesAsWords, _rapierSourceTokenValue, _rapierResolveSoftBreakTokens, _rapierInertParse, _rapierUnwrapElement, _rapierBidiStrong, _rapierSealBlockHtml, _rapierMergeForeignBlocks, render: (source, metadata = {}) => { if (!md) initMarkdownIt(); return _rapierRenderSemanticRoot(source, metadata).innerHTML; }, initMarkdownIt, _rapierRenderSemanticRoot, _rapierInstallSemanticProbe, _rapierApplyImageGeometry, _rapierImageAltSize, _rapierImageAltSourceParts, _rapierImageAltText, _rapierImageSizeAttributes, _rapierRawHtmlFragment, _rapierApplyBlockDirection, _rapierFirstStrongDir, _rapierAssignHeadingSlugs, _rapierDisambiguateRenderedAnchors, _rapierDecodeHash, _rapierDecorateJumpLists, _rapierMarkFigureCaptions, _rapierMarkListContinuations, _rapierMarkTableCaptions, _rapierNormalizeCodeElement, _rapierLanguageClass, _relabelFootnoteHtml, _footnoteIdFromLabel, wrapDisplayMath, parser: () => md};
}
export {RAPIER_TABLE_CAPTION_PREFIX_RE as tableCaptionPrefix, RAPIER_PORTABLE_HIGHLIGHT_HEX as portableHighlightHex, _RAPIER_RTL_SCRIPT as rtlScripts, createMarkdownRenderer};

export {mountHtmlBlocks, materializeObjects, objectPosterLabel, htmlImageRecord, htmlLayoutEdit, htmlModeEdit, mergeHtmlObjectBlocks};
