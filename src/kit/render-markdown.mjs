// SPDX-License-Identifier: MIT
const RAPIER_TABLE_CAPTION_PREFIX_RE = /^(?:Table:|:) /;
const RAPIER_PORTABLE_HIGHLIGHT_HEX = Object.freeze({
	green: '#35c57a', red: '#f05a62', blue: '#4f91f7', yellow: '#e6b91e', purple: '#9b6dea',
});
const _RAPIER_RTL_SCRIPT = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Phoenician}\p{Script=Imperial_Aramaic}\p{Script=Palmyrene}\p{Script=Nabataean}\p{Script=Hatran}\p{Script=Old_South_Arabian}\p{Script=Old_North_Arabian}\p{Script=Mende_Kikakui}\p{Script=Old_Hungarian}\p{Script=Old_Sogdian}\p{Script=Sogdian}\p{Script=Elymaic}\p{Script=Chorasmian}\p{Script=Yezidi}\p{Script=Old_Uyghur}\p{Script=Hanifi_Rohingya}]/u;
// The document's renderer. DOM, codecs and host state are explicit inputs.
function createMarkdownRenderer(runtime) {
  const {Node, _rapierPrefixPortableAnchors, RAPIER_HIGHLIGHT_COLOR_BY_MARKER, RAPIER_MARKDOWN_SPEC, RAPIER_RENDERED_HEADING_SELECTOR, _rapierApplyMarkdownSpec, _rapierChromeOwnsId, _rapierCodeHtml, _rapierDeriveDarkColor, _rapierDormantHeadings, _rapierEmbedAssetSource, _rapierHeadingSlugBase, _rapierNextHeadingSlug, _rapierHighlightAdmitted, _rapierInstallMarkdownMath, _rapierMarkdownPreview, _rapierPlainLayout, _rapierProviders, _rapierRemoteContent, _rapierRemoteImagePlaceholder, _rapierRemoteSubresourceOrigin, _rapierRenderedAnchorOriginalIds, _rapierSourceCharEscaped, _rapierSplitOpeningFrontmatter, _rapierUiDiagram, _rapierUiMath, document, escapeRapierHtmlText, globalThis, sanitizeRapierHtml, window} = runtime;
  let md = runtime.md;
function initMarkdownIt() {
	if (typeof window.markdownit !== 'function') throw new Error('markdownit');
	if (typeof _rapierMarkdownPreview === 'function') globalThis.rapierRenderPreview = _rapierMarkdownPreview; // Notes' cards read through here; the Node witnesses that run this function alone have no such neighbour

	md = window.markdownit({
		...RAPIER_MARKDOWN_SPEC.options,
		// The first paint is coloured: the CPU reading, synchronously, for every admitted fence.
		highlight: (code, lang) => lang && _rapierHighlightAdmitted(code) ? _rapierCodeHtml(code, lang) : '',
	});

	_rapierApplyMarkdownSpec(md, window);
	globalThis.RapierImageAssets.installMarkdownImages(md);
	_rapierInstallSemanticProbe(md);
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

	md.renderer.rules.rapier_color_open = (tokens, idx) => {
		const hex = String(tokens[idx].attrGet('data-md-color') || '').toLowerCase();
		if (!/^#[0-9a-f]{6}$/.test(hex)) return '<span>';
		const dark = _rapierDeriveDarkColor(hex);
		return '<span data-md-color="' + hex + '" style="--md-color:' + hex + ';--md-color-dark:' + dark + '">';
	};
	md.renderer.rules.rapier_color_close = () => '</span>';
	// Ink: the span carries its opener's body (the grammar's inkOpenBody: a sanitizer drops an attribute holding the
	// comment's close); the ink layer reads it back through the one grammar and draws the stroke over the words' own boxes.
	// The span itself shows nothing.
	md.renderer.rules.rapier_ink_open = (tokens, idx) => {
		const body = String(tokens[idx].attrGet('data-rapier-ink') || '');
		// The dark-page colour on the span, as the colour span's: an exported page draws its ink with no engine to ask (the
		// rules run on this thread alone; the Worker plants the parser, not the renderer).
		const spec = globalThis.RapierMarkdownSpec;
		const mark = spec && typeof spec.parseInkBody === 'function' ? spec.parseInkBody(body) : null;
		return '<span class="rapier-ink-mark" data-rapier-ink="' + md.utils.escapeHtml(body) + '"'
			+ (mark ? ' data-rapier-ink-dark="' + _rapierDeriveDarkColor(mark.hex || '#b32034') + '"' : '') + '>';
	};
	md.renderer.rules.rapier_ink_close = () => '</span>';

	const sourceToken = (source, visible, className) =>
		'<span class="rapier-source-token ' + className + '" data-rapier-source="' +
		encodeURIComponent(source) + '" data-rapier-visible="' + encodeURIComponent(visible) + '">' + md.utils.escapeHtml(visible) + '</span>';
	md.renderer.rules.emoji = (tokens, idx) => {
		const token = tokens[idx];
		const source = token.markup ? ':' + token.markup + ':' : token.content;
		return sourceToken(source, token.content, 'rapier-source-token--emoji');
	};
	md.renderer.rules.softbreak = () =>
		sourceToken('\n', '\u2060', 'rapier-source-token--softbreak');
	// A backslash escape the edit surface's writer would not write itself (`https\://`, `www\.`, `a\@b`: an unlinked
	// address, or a person's own escape) is carried through the edit projection as a source token, as a soft break and
	// an emoji are; the parser joins escapes into plain text before rendering, so they are kept apart first. The
	// characters the writer escapes on its own (\ * ` [ ] _) stay the writer's.
	md.core.ruler.before('text_join', 'rapier_escape_token', state => {
		for (const token of state.tokens) {
			if (token.type !== 'inline' || !token.children) continue;
			for (const child of token.children) {
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
		const src = token.attrGet('src') || '';
		const title = token.attrGet('title') || '';
		const rawAlt = String(token.content ?? token.attrGet('alt') ?? '');
		const size = _rapierImageAltSize(rawAlt);
		const semanticAlt = token.children ? self.renderInlineAsText(token.children, opts, env) : _rapierImageAltText(rawAlt, env);
		const suffix = size ? rawAlt.slice(size.alt.length) : '';
		const alt = suffix && semanticAlt.endsWith(suffix) ? semanticAlt.slice(0, -suffix.length) : semanticAlt;
		const layout = token.meta?.mdLayout?.imageOnly ? token.meta.mdLayout.marker : '';
		const asset = globalThis.RapierImageAssets.dataImage(src), reference = token.meta?.mdImage?.reference;
		// A connected host's own asset; a host without one (the server) supplies no port.
		if (!env.rapierPage && typeof globalThis.RapierEmbeddedImages?.imageHtml === 'function' &&
			(_rapierEmbedAssetSource?.(src) || asset && (reference || asset.codec === 'image/jxl' || asset.codec === 'image/svg+xml'))) return globalThis.RapierEmbeddedImages.imageHtml(
			reference, alt, title, size, layout, rawAlt, token.meta?.mdImage?.source, src);
		let loadable = false;
		try { loadable = !!src.trim() && /^(?:https?|file|blob|data):$/.test(new URL(src, document?.baseURI || globalThis.location?.href || 'https://rapier.invalid/').protocol); } catch (_) {}
		if (!loadable) {
			const escape = md.utils.escapeHtml;
			return '<span data-rapier-markdown-image="" data-rapier-remote-src="' + escape(src) + '" data-rapier-remote-alt="' + escape(alt) + '"'
				+ (title ? ' data-rapier-remote-title="' + escape(title) + '"' : '')
				+ (size ? ' data-rapier-image-alt-source="' + escape(rawAlt) + '"' : '')
				+ (layout ? ' data-rapier-image-layout="' + escape(encodeURIComponent(layout)) + '"' : '')
				+ (token.meta?.mdImage?.source ? ' data-rapier-image-source="' + escape(encodeURIComponent(token.meta.mdImage.source)) + '"' : '')
				+ '>' + escape(alt || src) + '</span>';
		}
		if (!env.rapierPage && !_rapierRemoteContent.allowed && _rapierRemoteSubresourceOrigin(src)) {
			const html = _rapierRemoteImagePlaceholder(src, alt, title, size, layout, rawAlt);
			return html.replace('<span ', '<span data-rapier-markdown-image="" ' +
				(token.meta?.mdImage?.source ? 'data-rapier-image-source="' + md.utils.escapeHtml(encodeURIComponent(token.meta.mdImage.source)) + '" ' : ''));
		}
		const attrs = [
			'data-rapier-markdown-image=""',
			'src="' + md.utils.escapeHtml(src) + '"',
			'alt="' + md.utils.escapeHtml(alt) + '"',
			'loading="lazy"',
			'decoding="async"',
		];
		if (token.meta?.mdImage?.source && token.meta.mdImage.source.length <= 4096)
			attrs.push('data-rapier-image-source="' + md.utils.escapeHtml(encodeURIComponent(token.meta.mdImage.source)) + '"');
		if (title) attrs.push('title="' + md.utils.escapeHtml(title) + '"');
		if (size && !token.meta?.mdLayout?.layout?.width) attrs.push('data-rapier-image-alt-source="' + md.utils.escapeHtml(rawAlt) + '"');
		if (layout) attrs.push('data-rapier-image-layout="' + md.utils.escapeHtml(encodeURIComponent(layout)) + '"');
		return '<img ' + attrs.join(' ') + _rapierImageSizeAttributes(size, layout) + '>';
	};

	md.renderer.rules.hr = function (tokens, idx) {
		const m = (tokens[idx].markup || '---').charAt(0);
		const style = m === '*' ? 'stars' : (m === '_' ? 'underscore' : 'dash');
		return '<hr data-hr-style="' + style + '">\n';
	};

	md.renderer.rules.rapier_break = () =>
		'<div class="rapier-page-break" data-md-break="page" contenteditable="false" role="separator" aria-label="Page break"></div>\n';

	// Raw HTML carries no editor hooks. Keep its fragment boundaries until the complete Markdown
	// markup reaches DOMPurify: sanitizing each HTML token closes containers before their body.
	// The harness runs this installer alone for the parser's acceptance; without the page's sanitizer the tokens pass.
	const inPage = typeof sanitizeRapierHtml === 'function' && typeof _rapierChromeOwnsId === 'function';
	const rawAttribute = /\s+([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^"'=<>`\s]+))?/g;
	// The id is read as HTML reads it: a numeric character reference (`&#115;ource-textarea` is `source-textarea`,
	// `&#x73;` the same) and the named references that spell a character an id can hold are decoded before the
	// chrome's ids are asked; every other name stays literal (no named reference spells a letter, a digit or a
	// hyphen). A string walk, not a parser: the render pass is the one HTML parser this markup meets.
	const RAW_ID_NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", lowbar: '_', UnderBar: '_', num: '#', colon: ':',
		period: '.', sol: '/', excl: '!', quest: '?', commat: '@', plus: '+', ast: '*', percnt: '%', dollar: '$', semi: ';',
		equals: '=', comma: ',', lpar: '(', rpar: ')', lsqb: '[', lbrack: '[', rsqb: ']', rbrack: ']', lcub: '{', lbrace: '{',
		rcub: '}', rbrace: '}', verbar: '|', vert: '|', VerticalLine: '|', bsol: '\\', Hat: '^', grave: '`', DiacriticalGrave: '`', Tab: '\t', NewLine: '\n' };
	const attributeText = value => String(value || '').replace(/^["']|["']$/g, '')
		.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{0,31}));?/g, (whole, dec, hex, name) => {
			const code = dec ? Number(dec) : hex ? parseInt(hex, 16) : -1;
			if (code >= 0) return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
			return Object.hasOwn(RAW_ID_NAMED, name) ? RAW_ID_NAMED[name] : whole;
		});
	if (inPage) {
		_rapierChromeOwnsId('');
		const cleanTag = tag => /^<[A-Za-z]/.test(tag) ? tag.replace(rawAttribute, (whole, name, value) => {
			const key = name.toLowerCase();
			return key.startsWith('data-') || key === 'for' || key === 'id' && _rapierChromeOwnsId(attributeText(value)) ? '' : whole;
		}) : tag;
		md.renderer.rules.html_inline = (tokens, idx) => cleanTag(tokens[idx].content);
		md.renderer.rules.html_block = (tokens, idx) => _rapierRawHtmlFragment(tokens[idx].content, cleanTag, md);
	}

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
		for (const token of state.tokens) {
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
	{
		let _diagramPromptedOnce = false;
		md.renderer.rules.fence = function (tokens, idx, opts, env, self) {
			const token = tokens[idx];
			token.attrSet('data-rapier-fence', token.markup || '```');
			token.attrSet('data-rapier-fence-info', token.info == null ? '' : String(token.info));
			const lang = String(token.info || '').trim().split(/\s+/)[0].toLowerCase();
			if (lang !== 'mermaid' || env.rapierPage) return _fenceDefault(tokens, idx, opts, env, self);
			const src = String(token.content || '').replace(/\n$/, '');
			const fence = md.utils.escapeHtml(token.markup || '```');
			const info = token.info == null ? '' : String(token.info);
			const escapedSrc = md.utils.escapeHtml(src);
			const sourceHtml = '<pre class="diagram-source"><code data-rapier-fence="' + fence +
				'" data-rapier-fence-info="' + md.utils.escapeHtml(info) + '">' + escapedSrc + '</code></pre>';
			const encoded = encodeURIComponent(src);
			if (token.meta?.rapierFenceClosed === false) {
				// No render request: even a valid diagram body must not conceal an unfinished fence.
				return '<figure class="diagram-block diagram-block--error" data-diagram-state="error"' +
					' data-diagram-unclosed="" data-diagram-src="' + encoded + '">' +
					'<p class="diagram-reason">Mermaid block may be missing its closing <code>' + fence +
					'</code> fence. Text below is still inside the block.</p>' + sourceHtml + '</figure>\n';
			}
			const native = globalThis.RapierFlowchart?.parseFlowchart(src).ok === true;
			const provider = _rapierProviders.mermaid;
			const ready = native || !!(provider && provider.status === 'ready' && typeof provider.renderToString === 'function');
			if (!ready && !_diagramPromptedOnce) {
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
		let _mathPromptedOnce = false;
		const _renderMath = (src, displayMode, page) => {
			const marker = displayMode ? '$$' : '$';
			const source = marker + src + marker, literal = md.utils.escapeHtml(source);
			if (page) return '<span data-rapier-math-source="">' + literal + '</span>';
			const mathProvider = _rapierProviders.math;
			if (!mathProvider || mathProvider.status !== 'ready' || typeof mathProvider.renderToString !== 'function') {
				if (!_mathPromptedOnce) {
					_mathPromptedOnce = true;
					try { _rapierUiMath.request(); } catch (_) {}
				}
				return '<span class="math-placeholder" data-rapier-math-source="" title="Install the math plug-in in Settings to show this equation.">'
						 + literal + '</span>';
			}
			try {
				const rendered = mathProvider.renderToString(src, { displayMode });
				return '<span class="math-rendered" data-math-src="'
						 + encodeURIComponent(source) + '">' + rendered + '</span>';
			}
			catch (_) { return '<span data-rapier-math-source="">' + literal + '</span>'; }
		};
		md.renderer.rules.math_inline = (tokens, idx, _opts, env) => _renderMath(tokens[idx].content, false, env.rapierPage);
		md.renderer.rules.math_block  = (tokens, idx, _opts, env) => wrapDisplayMath(_renderMath(tokens[idx].content, true, env.rapierPage)) + '\n';
	}
	globalThis.RapierMarkdownLayout.installMarkdownLayout(md);
	globalThis.RapierImageAssets.configureParser(md, _rapierSplitOpeningFrontmatter);
}

function _rapierRenderSemanticRoot(canonical, metadata, options = {}) {
	const root = document.createElement('div');
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
	const env = options.page ? {rapierPage: true} : {};
	let rendered = md
		? md.render(markdown, env)
		: '<pre><code>' + escapeRapierHtmlText(markdown) + '</code></pre>';
	if (md && env.footnotes && Array.isArray(env.footnotes.list) && env.footnotes.list.length) {
		const labels = env.footnotes.list.map((item, index) =>
			String(item && item.label || ('inline-' + (index + 1))));
		rendered = _relabelFootnoteHtml(rendered, labels);
	}
	root.innerHTML = sanitizeRapierHtml(rendered, options.page ? 'source' : 'export');
	_rapierApplyBlockDirection(root);

	_rapierAssignHeadingSlugs(root, RAPIER_RENDERED_HEADING_SELECTOR, false);
	_rapierDisambiguateRenderedAnchors(root);

	root.querySelectorAll('pre > code').forEach(_rapierNormalizeCodeElement);
	_rapierMarkTableCaptions(root);
	_rapierMarkFigureCaptions(root);
	_rapierMarkListContinuations(Array.from(root.children));
	_rapierDecorateJumpLists(root);
	return root;
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
		try {
			Object.defineProperty(outTokens, '_rapierInlineProbeId', { value: nextId, configurable: true });
		} catch (_) { outTokens._rapierInlineProbeId = nextId; }
		try {
			const result = originalParse.call(this, source, parser, targetEnv, outTokens);
			for (const token of outTokens) {
				try { Object.defineProperty(token, '_rapierInlineProbeId', { value: nextId, configurable: true }); }
				catch (_) { token._rapierInlineProbeId = nextId; }
			}
			return result;
		} finally { targetEnv.__rapierInlineProbeId = priorId; }
	};

	instance.inline.ruler.before('escape', 'rapier_semantic_probe', function (state, silent) {
		if (silent || !state || !state.env) return false;
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

function _rapierImageSizeAttributes(size, marker) {
    const layout = globalThis.RapierMarkdownLayout.parseLayout(marker || '');
    // Plain (rung 0, docs/standard-adoption.md): every picture renders at its natural width, the
    // same as a reader with no layout facts at all -- Obsidian's `![alt|N]` alt-text width (the
    // `size` fallback below) is a different, established convention and is unaffected.
    const style = layout && !_rapierPlainLayout() ? globalThis.RapierMarkdownLayout.imageStyle(layout) : '';
    if (layout?.width != null && style) return ' data-md-image-width="' + layout.width + '" style="' + style + '"';
    // A fade rides beside any width, the alt-text's own included.
    return size ? ' width="' + size.width + '" data-rapier-image-size="' + size.width +
        '" style="--md-image-width:' + size.width + 'px' + (style ? ';' + style : '') + '"' : style ? ' style="' + style + '"' : '';
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

function _rapierApplyBlockDirection(root) {
	if (!root || typeof root.querySelectorAll !== 'function') return;
	for (const el of root.querySelectorAll(_RAPIER_DIR_BLOCKS)) {
		if (el.closest('pre, code')) continue;
		const dir = _rapierFirstStrongDir(el.textContent);
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

function _rapierAssignHeadingSlugs(root, selector = RAPIER_RENDERED_HEADING_SELECTOR, reserveExisting = true) {
	if (!root || !root.querySelectorAll) return;
	const used = Object.create(null);
	const headings = Array.from(root.querySelectorAll(selector)).concat(_rapierDormantHeadings(root, selector));
	const headingSet = new Set(headings);
	if (reserveExisting) (root.isConnected ? document : root).querySelectorAll('[id]').forEach(element => {
		if (!headingSet.has(element) && element.id) used[element.id] = 0;
	});
	headings.forEach(heading => {
		heading.id = _rapierNextHeadingSlug(_rapierHeadingSlugBase(heading.textContent), used);
	});
}

function _rapierDisambiguateRenderedAnchors(root) {
	if (!root || !root.querySelectorAll) return;
	const headings = new Set(root.querySelectorAll(RAPIER_RENDERED_HEADING_SELECTOR));
	const candidates = Array.from(root.querySelectorAll('[id]'))
		.filter(element => !headings.has(element));
	candidates.forEach(element => {
		const original = _rapierRenderedAnchorOriginalIds.get(element);
		if (original) element.id = original;
	});

	const groups = new Map();
	candidates.forEach(element => {
		if (!element.id) return;
		if (!groups.has(element.id)) groups.set(element.id, []);
		groups.get(element.id).push(element);
	});
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

	groups.forEach((elements, original) => {
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

		elements.forEach(element => {
			if (element === winner) return;
			const alias = allocate(original);
			element.id = alias;
			_rapierRenderedAnchorOriginalIds.set(element, original);
		});

		const labels = new Set(elements.map(element => element.getAttribute('data-footnote-label'))
			.filter(label => label != null));
		const matchingHashLinks = selector => Array.from(root.querySelectorAll(selector))
			.filter(link => _rapierDecodeHash(link.getAttribute('href')) === original ||
				(labels.size && labels.has(link.getAttribute('data-footnote-label'))));
		if (elements.some(element => element.classList.contains('footnote-item'))) {
			matchingHashLinks('.footnote-ref a[href^="#"]')
				.forEach(link => link.setAttribute('href', '#' + winnerId));
		} else if (elements.some(element => element.closest && element.closest('.footnote-ref'))) {
			matchingHashLinks('.footnote-backref[href^="#"]')
				.forEach(link => link.setAttribute('href', '#' + winnerId));
		}
	});
}

function _rapierDecodeHash(hash) {
	// A document's own address may carry a heading after it (`#d/<id>/<heading>`): the heading is the
	// anchor, and an address with no heading names nothing to jump to. A view's (`#v/draw`,
	// `#v/notes`) names no heading either (docs/agents.md "The address of a document").
	let raw = String(hash || '').replace(/^#/, '');
	const own = /^[dnv]\/[^/]*(?:\/(.*))?$/.exec(raw);
	if (own) raw = own[1] || '';
	try { return decodeURIComponent(raw); }
	catch (_) { return raw; }
}

function _rapierDecorateJumpLists(root) {
	root.querySelectorAll('ul').forEach(list => {
		if (list.closest('li')) return;
		const items = Array.from(list.children).filter(item => item.tagName === 'LI');
		if (items.length < 2 || items.length !== list.children.length) return;
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
			if (label && /^jump\s+to:?$/i.test(String(label.textContent || '').trim())) {
				label.classList.add('rapier-jump-label');
			}
		}
	});

	const only = root.children && root.children.length === 1 ? root.firstElementChild : null;
	if (only && only.tagName === 'P' && /^jump\s+to:?$/i.test(String(only.textContent || '').trim())) {
		only.classList.add('rapier-jump-label-candidate');
	}
}

function _rapierMarkFigureCaptions(root) {
	// Same path as a table caption: an ordinary paragraph after the picture, still the source line.
	const figureCaption = /^Figure: /;
	root.querySelectorAll('p').forEach(paragraph => {
		if (!figureCaption.test(paragraph.textContent || '')) return;
		const previous = paragraph.previousElementSibling;
		if (!previous || previous.tagName !== 'P') return;
		const images = previous.querySelectorAll('img');
		if (images.length !== 1 || previous.textContent.trim()) return;
		paragraph.classList.add('rapier-figure-caption');
	});
}

function _rapierMarkListContinuations(blocks) {
	const isHeading = element => !!element && /^H[1-6]$/.test(element.tagName);
	blocks.forEach((element, index) => {
		if (!element || element.tagName !== 'OL') return;
		const start = parseInt(element.getAttribute('start'), 10);
		const last = (Number.isFinite(start) ? start : 1) + element.querySelectorAll(':scope > li').length - 1;
		const headings = [];
		let next = index + 1;
		while (isHeading(blocks[next])) headings.push(blocks[next++]);
		const following = blocks[next];
		if (!headings.length || !following || following.tagName !== 'OL') return;
		if (parseInt(following.getAttribute('start'), 10) !== last + 1) return;
		element.setAttribute('data-rapier-list-continues', '');
		headings.forEach(heading => heading.setAttribute('data-rapier-list-through', ''));
	});
}

function _rapierMarkTableCaptions(root) {
	// The source convention is untouched: the caption stays an ordinary trailing paragraph
	// (docs/markdown-standard.md). Only this rendered projection associates it with its table —
	// via a generated id plus aria-describedby, not a real <caption>, which would have to move the
	// paragraph inside <table> and break the one-DOM-node-per-source-block correspondence other
	// passes (heading slugs, portable export) rely on for this same root.
	const used = new Set(Array.from(root.querySelectorAll('[id]'), element => element.id));
	let ordinal = 0;
	root.querySelectorAll('table').forEach(table => {
		const sibling = table.nextElementSibling;
		if (!sibling || sibling.tagName !== 'P') return;
		if (!RAPIER_TABLE_CAPTION_PREFIX_RE.test(sibling.textContent || '')) return;
		sibling.classList.add('rapier-table-caption');
		let id;
		do { id = 'rapier-table-caption-' + (++ordinal); } while (used.has(id));
		used.add(id);
		sibling.id = id;
		const existing = (table.getAttribute('aria-describedby') || '').trim();
		table.setAttribute('aria-describedby', existing ? existing + ' ' + id : id);
	});
}



function _rapierNormalizeCodeElement(code) {
	const lang = _rapierLanguageClass(code);
	code.replaceChildren(document.createTextNode(code.textContent || ''));
	code.removeAttribute('class');
	if (lang) code.className = 'language-' + lang;
}

function _rapierLanguageClass(element) {
	if (!element || !element.classList) return '';
	// CommonMark's first info word is an identifier, including Unicode and punctuation.
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

function _rapierFlattenPortableDetails(root) {
	const blockTags = new Set([
		'ADDRESS','ARTICLE','ASIDE','BLOCKQUOTE','DIV','DL','FIELDSET','FIGURE',
		'FOOTER','FORM','H1','H2','H3','H4','H5','H6','HEADER','HR','MAIN',
		'NAV','OL','P','PRE','SECTION','TABLE','UL',
	]);
	Array.from(root.querySelectorAll('details')).reverse().forEach(details => {
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
		Array.from(details.childNodes).forEach(child => {
			if (child === summary) return;
			const isText = child.nodeType === Node.TEXT_NODE;
			if (isText && !String(child.nodeValue || '').trim()) return;
			const isBlock = child.nodeType === Node.ELEMENT_NODE && blockTags.has(child.tagName);
			if (!isBlock) {
				if (!paragraph) {
					paragraph = document.createElement('p');
					section.appendChild(paragraph);
				}
				paragraph.appendChild(child);
				return;
			}
			paragraph = null;
			section.appendChild(child);
		});
		details.replaceWith(section);
	});
}

function _rapierProjectPortableRoot(semanticRoot, options) {
	const opts = options || {};
	// This projection is HTML-shaped (width baked into a CSS `style`, `data-*` stripped) for the
	// consumers that read HTML -- publishing/fragment export, TXT. DOCX is not an HTML consumer: its
	// writer (interchange/docx.mjs) reads the layout comment itself, so stripping it first and
	// handing back CSS only throws the fact away before the writer ever sees it. `keepLayoutData`
	// leaves the image and text layout records, ink meaning and paragraph alignment exactly as
	// the semantic root carries them. Ordinary paragraph/list CSS measurements also reach their
	// native reader; no derived private CSS is needed.
	const keepLayoutData = !!opts.keepLayoutData;
	const root = semanticRoot.cloneNode(true), nativeElements = new Set();
	// A source soft break is a reading space, never the editor's invisible token.
	_rapierResolveSoftBreakTokens(root);
	if (opts.keepDiagrams) for (const figure of root.querySelectorAll('.diagram-block[data-diagram-native]')) {
		const svg = figure.querySelector('.diagram-cache > svg.rapier-native-flowchart');
		if (figure.getAttribute('data-diagram-state') === 'ready' && svg) {
			// A class in authored HTML grants no exemption: only the native materialization above does.
			for (const element of [svg, ...svg.querySelectorAll('*')]) nativeElements.add(element);
			figure.replaceWith(svg);
		}
	}

	root.querySelectorAll('blockquote').forEach(blockquote => {
		const info = _rapierCalloutInfo(blockquote);
		if (!info) return;
		if (info.existing) info.existing.remove();
		else _rapierRemoveCalloutMarker(info.first);
		const label = document.createElement('strong');
		label.textContent = info.type.charAt(0) + info.type.slice(1).toLowerCase() + ': ';
		info.first.insertBefore(label, info.first.firstChild);
	});

	root.querySelectorAll('input[type="checkbox"]').forEach(input => {
		const nextStartsWithSpace = input.nextSibling
			&& input.nextSibling.nodeType === Node.TEXT_NODE
			&& /^\s/.test(input.nextSibling.nodeValue || '');
		input.replaceWith(document.createTextNode((input.checked ? '☒' : '☐') + (nextStartsWithSpace ? '' : ' ')));
	});

	root.querySelectorAll('.math-display-wrap').forEach(wrapper => {
		const source = _rapierMathSource(wrapper);
		const p = document.createElement('p');
		const code = document.createElement('code');
		code.textContent = source || '[equation]';
		p.appendChild(code);
		wrapper.replaceWith(p);
	});
	root.querySelectorAll('.math-rendered,.math-placeholder').forEach(math => {
		const code = document.createElement('code');
		code.textContent = _rapierMathSource(math) || '[equation]';
		math.replaceWith(code);
	});
	root.querySelectorAll('math').forEach(math => {
		const code = document.createElement('code');
		code.textContent = String(math.textContent || '').trim() || '[equation]';
		math.replaceWith(code);
	});

	_rapierFlattenPortableDetails(root);

	root.querySelectorAll('section.footnotes').forEach(section => {
		section.querySelectorAll('.footnotes-sep').forEach(node => node.remove());
		if (!section.querySelector(':scope > h1,:scope > h2,:scope > h3')) {
			const heading = document.createElement('h2');
			heading.textContent = 'Footnotes';
			section.insertBefore(heading, section.firstChild);
		}
	});

	root.querySelectorAll('.table-scroll-wrap,.math-display-wrap').forEach(_rapierUnwrapElement);

	root.querySelectorAll('pre > code').forEach(_rapierNormalizeCodeElement);

	root.querySelectorAll('svg').forEach(svg => {
		if (nativeElements.has(svg)) return;
		const title = svg.getAttribute('aria-label')
			|| (svg.querySelector('title') && svg.querySelector('title').textContent)
			|| '';
		svg.replaceWith(document.createTextNode(title ? '[Image: ' + title.trim() + ']' : '[Image]'));
	});

	_rapierPrefixPortableAnchors(root, opts.baseName);

	root.querySelectorAll('*').forEach(element => {
		if (nativeElements.has(element)) return;
		const lang = element.tagName === 'CODE' ? _rapierLanguageClass(element) : '';
		// The native note reader needs these transient roles to omit the renderer's
		// separator and return-link spacing before it compares source-owned review notes.
		const footnoteRole = keepLayoutData ? ['footnote-backref', 'footnotes-sep']
			.filter(name => element.classList.contains(name)).join(' ') : '';
		const columnAlignment = /^(TH|TD)$/.test(element.tagName) && /^(left|center|right)$/.test(element.style.textAlign)
			? element.style.textAlign : '';
		const alignment = globalThis.RapierMarkdownLayout.parseLayoutAttribute(element.getAttribute('data-md-layout'))?.align || columnAlignment;
		const imageLayout = element.tagName === 'IMG' ? globalThis.RapierMarkdownLayout.parseLayoutAttribute(element.getAttribute('data-rapier-image-layout')) : null;
		const measurements = keepLayoutData && /^(?:P|H[1-6]|LI|OL|UL)$/.test(element.tagName)
			? ['text-indent', 'margin-inline-start'].map(property => [property, element.style.getPropertyValue(property)]) : [];

		const colorHex = element.tagName === 'SPAN' ? element.getAttribute('data-md-color') : null;

		const highlightHex = element.tagName === 'MARK'
			? (RAPIER_PORTABLE_HIGHLIGHT_HEX[String(element.getAttribute('data-rapier-highlight') || '').toLowerCase()] || RAPIER_PORTABLE_HIGHLIGHT_HEX.yellow)
			: null;

		const isTableCaption = element.tagName === 'P' && element.classList.contains('rapier-table-caption');

		const isPageBreak = element.hasAttribute('data-md-break');
		Array.from(element.attributes).forEach(attribute => {
			const name = attribute.name.toLowerCase();
			if (keepLayoutData && (name === 'data-rapier-image-layout' || name === 'data-md-layout' || name === 'data-md-align' || name === 'data-rapier-ink')) return;
			if (name === 'class' || name === 'style' || name.startsWith('data-')
					|| name === 'contenteditable' || name === 'spellcheck'
					|| name === 'tabindex' || name === 'disabled' || name === 'aria-disabled') {
				element.removeAttribute(attribute.name);
			}
		});
		if (footnoteRole) element.className = footnoteRole;
		if (lang) element.className = 'language-' + lang;
		for (const [property, value] of measurements) if (value) element.style.setProperty(property, value);
		if (alignment) element.style.textAlign = alignment;
		if (imageLayout && !keepLayoutData) {
			const pictureStyle = globalThis.RapierMarkdownLayout.imageStyle(imageLayout);
			if (imageLayout.width != null) element.removeAttribute('width');
			if (pictureStyle) element.style.cssText = pictureStyle;
		}
		if (colorHex && /^#[0-9a-f]{6}$/i.test(colorHex)) element.style.color = colorHex.toLowerCase();
		if (highlightHex) element.style.backgroundColor = highlightHex;
		if (isTableCaption) { element.style.fontStyle = 'italic'; element.style.color = '#555555'; }

		if (isPageBreak) {
			const p = document.createElement('p');
			p.setAttribute('style', 'page-break-before: always');
			element.replaceWith(p);
		}
	});

	const clean = document.createElement('div');
	clean.innerHTML = sanitizeRapierHtml(root.innerHTML, 'export');
	return clean;
}

function _rapierPortableHtml(root) {
	return sanitizeRapierHtml(root ? root.innerHTML : '', 'export').trim();
}

function _rapierNormalizeInlineText(value) {
	return String(value || '')
		.replace(/\u00a0/g, ' ')
		.replace(/[\t\f\v ]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.trim();
}

// What a text file says where a picture stands: its words, and its address unless the picture is carried in the document itself.
function _rapierPictureWords(alt, src) {
	if (/^data:image\//i.test(src)) return alt ? '[Image: ' + alt + ']' : '[Image]';
	if (src) return alt ? '[Image: ' + alt + ' — ' + src + ']' : '[Image: ' + src + ']';
	return alt ? '[Image: ' + alt + ']' : '[Image]';
}

// Held Markdown and HTML pictures keep their addresses as inert data. Text export reads them before
// the portable projection removes editor attributes, without restoring a fetching image source.
function _rapierHeldPicturesAsWords(root) {
	const copy = root.cloneNode(true);
	copy.querySelectorAll('span[data-rapier-remote-src],img[data-rapier-remote-src]').forEach(held => held.replaceWith(document.createTextNode(
		_rapierPictureWords(String(held.getAttribute('data-rapier-remote-alt') || '').trim(), String(held.getAttribute('data-rapier-remote-src') || '').trim()))));
	return copy;
}

function _rapierPortableInlineText(node, options) {
	const opts = options || {};
	if (!node) return '';
	if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
	if (node.nodeType !== Node.ELEMENT_NODE) return '';
	const tag = node.tagName;
	if (tag === 'BR') return '\n';
	// A task's box is what the person sees of it.
	if (tag === 'INPUT') return /^checkbox$/i.test(node.type || '') ? (node.checked || node.hasAttribute('checked') ? '☑ ' : '☐ ') : '';
	if (tag === 'IMG') {
		if (opts.visible) return '';
		const alt = String(node.getAttribute('alt') || '').trim();
		const src = String(node.getAttribute('src') || '').trim();
		return _rapierPictureWords(alt, src);
	}
	if (tag === 'A') {
		const label = _rapierNormalizeInlineText(Array.from(node.childNodes)
			.map(child => _rapierPortableInlineText(child, opts)).join(''));
		const href = String(node.getAttribute('href') || '').trim();
		if (opts.visible || !href || href.charAt(0) === '#') return label;
		if (!label || label === href) return href;
		return label + ' (' + href + ')';
	}
	if (tag === 'CODE' && !opts.inPre) {
		const source = String(node.textContent || '');
		return opts.visible ? source : source ? '`' + source + '`' : '';
	}
	return Array.from(node.childNodes)
		.map(child => _rapierPortableInlineText(child, opts)).join('');
}

function _rapierPortableListText(list, depth, options) {
	const opts = options || {};
	const level = Math.max(0, depth | 0);
	const ordered = list.tagName === 'OL';
	let counter = ordered ? (parseInt(list.getAttribute('start'), 10) || 1) : 0;
	const lines = [];
	Array.from(list.children).filter(child => child.tagName === 'LI').forEach(item => {
		const nested = Array.from(item.children).filter(child => child.tagName === 'UL' || child.tagName === 'OL');
		const content = Array.from(item.childNodes)
			.filter(child => !(child.nodeType === Node.ELEMENT_NODE && (child.tagName === 'UL' || child.tagName === 'OL')))
			.map(child => _rapierPortableInlineText(child, opts)).join('');
		const normalized = _rapierNormalizeInlineText(content);
		const indent = '  '.repeat(level);
		// A task shows its box where a bullet would be.
		const marker = /^[☐☑☒]/.test(normalized) ? '' : ordered ? (counter++) + '. ' : '• ';
		const parts = (normalized || '').split('\n');
		lines.push(indent + marker + (parts.shift() || ''));
		parts.forEach(part => lines.push(indent + '  ' + part));
		nested.forEach(child => {
			const nestedText = _rapierPortableListText(child, level + 1, opts);
			if (nestedText) lines.push(nestedText);
		});
	});
	return lines.join('\n');
}

// A table, or a part of one a selection clipped out (a head, a body, a row): its rows.
function _rapierPortableTableText(table, options) {
	const opts = options || {};
	const rows = table.tagName === 'TR' ? [table] : Array.from(table.querySelectorAll('tr'));
	return rows.map(row => {
		return Array.from(row.children)
			.filter(cell => cell.tagName === 'TH' || cell.tagName === 'TD')
			.map(cell => _rapierNormalizeInlineText(_rapierPortableInlineText(cell, opts)))
			.join(opts.visible ? '\t' : ' | ');
	}).filter(Boolean).join('\n');
}

function _rapierPortablePlainText(root, options) {
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

	const collectChildren = parent => {
		let inline = [];
		const flush = () => {
			if (!inline.length) return;
			pushBlock(_rapierNormalizeInlineText(inline.map(node => _rapierPortableInlineText(node, opts)).join('')), false);
			inline = [];
		};
		const tablePart = node => node.nodeType === Node.ELEMENT_NODE && /^(THEAD|TBODY|TFOOT|TR)$/.test(node.tagName);
		const blankText = node => node.nodeType === Node.TEXT_NODE && !String(node.nodeValue || '').trim();
		const children = Array.from(parent.childNodes);
		const inTableRun = index => { for (let at = index - 1; at >= 0; at--) { if (!blankText(children[at])) return tablePart(children[at]); } return false; };
		children.forEach((child, index) => {
			if (tablePart(child)) {
				// The parts of a table a selection clipped out of it: one block of rows, whichever parts arrived.
				if (inTableRun(index)) return;
				flush();
				const parts = [];
				for (let at = index; at < children.length && (tablePart(children[at]) || blankText(children[at])); at++) {
					if (tablePart(children[at])) parts.push(_rapierPortableTableText(children[at], opts));
				}
				pushBlock(parts.filter(Boolean).join('\n'), false);
			} else if (blankText(child) && inTableRun(index)) {
				return;
			} else if (child.nodeType === Node.ELEMENT_NODE && blockTags.has(child.tagName)) {
				flush();
				collectBlock(child);
			} else if (opts.visible && child.nodeType === Node.ELEMENT_NODE && child.tagName === 'CODE' && String(child.textContent || '').includes('\n')) {
				// Lines of a code block taken without their block: the code as shown, every space kept.
				flush();
				pushBlock(String(child.textContent || ''), true);
			} else {
				inline.push(child);
			}
		});
		flush();
	};

	const collectBlock = node => {
		if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
		const tag = node.tagName;
		if (/^H[1-6]$/.test(tag) || tag === 'P') {
			const text = _rapierNormalizeInlineText(_rapierPortableInlineText(node, opts));
			// An empty paragraph (the line Enter makes) is a line of its own, as it is in Word's plain text: one newline more between its neighbours.
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
			pushBlock(_rapierPortableListText(node, 0, opts), false);
			return;
		}
		if (tag === 'TABLE') {
			pushBlock(_rapierPortableTableText(node, opts), false);
			return;
		}
		if (tag === 'BLOCKQUOTE') {
			const before = blocks.length;
			collectChildren(node);
			const quoted = blocks.splice(before).filter(block => !block.blank).map(block => block.text).join('\n\n');
			if (quoted) pushBlock(opts.visible ? quoted : quoted.split('\n').map(line => line ? '> ' + line : '>').join('\n'), true);
			return;
		}
		if (tag === 'DL') {
			const children = Array.from(node.children);
			for (let i = 0; i < children.length; i++) {
				if (children[i].tagName !== 'DT') continue;
				const term = _rapierNormalizeInlineText(_rapierPortableInlineText(children[i], opts));
				const defs = [];
				while (children[i + 1] && children[i + 1].tagName === 'DD') {
					defs.push(_rapierNormalizeInlineText(_rapierPortableInlineText(children[++i], opts)));
				}
				pushBlock(term + (defs.length ? ' — ' + defs.join('\n  ') : ''), false);
			}
			return;
		}
		if (tag === 'DETAILS') {
			const summary = node.querySelector(':scope > summary');
			if (summary) pushBlock(_rapierNormalizeInlineText(_rapierPortableInlineText(summary, opts)), false);
			Array.from(node.children).filter(child => child !== summary).forEach(collectBlock);
			return;
		}
		collectChildren(node);
	};

	collectChildren(root);
	// Each block stands a blank line from the next, and each empty paragraph between them adds one newline more.
	let joined = '', blanks = 0;
	for (const block of blocks) {
		if (block.blank) { blanks++; continue; }
		joined += (joined ? '\n\n' + '\n'.repeat(blanks) : '') + block.text;
		blanks = 0;
	}
	const text = joined.trim();
	return opts.finalNewline && text ? text + '\n' : text;
}

// The text file Export writes: a Markdown document's portable words and one final newline, any other document's own text.
// The editor's Export and the door's txt both end here.
function _rapierPlainTextFile(context) {
	return context.metadata.docKind === 'markdown'
		? _rapierPortablePlainText(_rapierProjectPortableRoot(_rapierHeldPicturesAsWords(context.semanticRoot), { baseName: context.baseName }), { finalNewline: true })
		: context.canonical;
}

function _rapierSourceTokenValue(node) {
	if (!node?.hasAttribute('data-rapier-source') || !node.hasAttribute('data-rapier-visible') ||
			Array.from(node.childNodes).some(child => child.nodeType !== Node.TEXT_NODE)) return null;
	try {
		return node.textContent === decodeURIComponent(node.getAttribute('data-rapier-visible'))
			? decodeURIComponent(node.getAttribute('data-rapier-source')) : null;
	} catch (_) { return null; }
}

function _rapierResolveSoftBreakTokens(root) {
	root.querySelectorAll('.rapier-source-token--softbreak').forEach(token => {
		if (_rapierSourceTokenValue(token) === '\n') token.replaceWith(document.createTextNode(' '));
		else token.replaceWith(...token.childNodes);
	});
	return root;
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

  return {_rapierCalloutInfo, _rapierRemoveCalloutMarker, _rapierMathSource, _rapierFlattenPortableDetails, _rapierProjectPortableRoot, _rapierPortableHtml, _rapierNormalizeInlineText, _rapierPortableInlineText, _rapierPortableListText, _rapierPortableTableText, _rapierPortablePlainText, _rapierPlainTextFile, _rapierHeldPicturesAsWords, _rapierSourceTokenValue, _rapierResolveSoftBreakTokens, _rapierUnwrapElement, _rapierBidiStrong, render: (source, metadata = {}) => { if (!md) initMarkdownIt(); return _rapierRenderSemanticRoot(source, metadata).innerHTML; }, initMarkdownIt, _rapierRenderSemanticRoot, _rapierInstallSemanticProbe, _rapierImageAltSize, _rapierImageAltSourceParts, _rapierImageAltText, _rapierImageSizeAttributes, _rapierRawHtmlFragment, _rapierApplyBlockDirection, _rapierFirstStrongDir, _rapierAssignHeadingSlugs, _rapierDisambiguateRenderedAnchors, _rapierDecodeHash, _rapierDecorateJumpLists, _rapierMarkFigureCaptions, _rapierMarkListContinuations, _rapierMarkTableCaptions, _rapierNormalizeCodeElement, _rapierLanguageClass, _relabelFootnoteHtml, _footnoteIdFromLabel, wrapDisplayMath, parser: () => md};
}
export {RAPIER_TABLE_CAPTION_PREFIX_RE as tableCaptionPrefix, RAPIER_PORTABLE_HIGHLIGHT_HEX as portableHighlightHex, _RAPIER_RTL_SCRIPT as rtlScripts, createMarkdownRenderer};
