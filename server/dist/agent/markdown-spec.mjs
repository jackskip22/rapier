import {createMathMatcher} from '../math/delimiters.mjs';
import {installMathRules} from '../math/markdown-rules.mjs';
import {splitOpeningFrontmatter as _rapierSplitOpeningFrontmatter} from '../spec/frontmatter.mjs';
import {readDocumentSettings as _rapierReadDocumentSettings, updateDocumentSettings as _rapierUpdateDocumentSettings, DOCUMENT_LEADING as RAPIER_DOCUMENT_LEADING, documentTitle as _rapierDocumentTitle, documentLanguage as _rapierDocumentLanguage, documentSettingsStyle as _rapierDocumentSettingsStyle, documentSettingsPageRule as _rapierDocumentSettingsPageRule,
	documentFont as _rapierDocumentFont, writeDocumentFontSetting as _rapierWriteDocumentFontSetting} from '../spec/document-settings.mjs';
import {fontDataUrl as rapierFontDataUrl, fontAssetKey as rapierFontAssetKey, readFontAssets as rapierReadFontAssets,
	writeFontAssets as rapierWriteFontAssets, serializeFontAsset as rapierSerializeFontAsset, documentFontsCss as rapierDocumentFontsCss,
	documentFontUsage as rapierDocumentFontUsage} from '../spec/document-fonts.mjs';

// SPDX-License-Identifier: AGPL-3.0-only
import {
	TEXT_COLOR_NAMES as RAPIER_TEXT_COLOR_NAMES,
	typography as rapierTypography, typographySourceRanges as rapierTypographySourceRanges, createTypography as rapierCreateTypography, FONT_STACKS as RAPIER_FONT_STACKS,
	PAGE_BREAK_MARKER as RAPIER_PAGE_BREAK_MARKER, formatColorRun as rapierFormatColorRun,
	pairMarkers as rapierPairMarkers, quotedWillSpan as rapierQuotedWillSpan,
	normalizeFontFamily as rapierNormalizeFontFamily, fontFamilyCss as rapierFontFamilyCss, formatFontRun as rapierFormatFontRun,
	INK_KINDS as RAPIER_INK_KINDS, INK_CLOSE as RAPIER_INK_CLOSE,
	INK_PATH_MAX as RAPIER_INK_PATH_MAX, INK_INT_MAX as RAPIER_INK_INT_MAX,
	formatInkOpen as rapierFormatInkOpen, formatInkRun as rapierFormatInkRun,
	matchInkOpen as rapierMatchInkOpen, parseInkOpen as rapierParseInkOpen,
	inkOpenBody as rapierInkOpenBody, parseInkBody as rapierParseInkBody,
	isInkClose as rapierIsInkClose, scanInkMarkers as rapierScanInkMarkers,
	pairInkMarkers as rapierPairInkMarkers, stripInkMarkers as rapierStripInkMarkers,
	pairInkSpans as rapierPairInkSpans, sliceInkArrows as rapierSliceInkArrows, prepareInkPaste as rapierPrepareInkPaste,
	hasInkMarker as rapierHasInkMarker, mayRetireInk, INK_OPEN_PATTERN as RAPIER_INK_OPEN_PATTERN,
	readInkMatch as rapierReadInkMatch, formatInkOpenFromBody as rapierFormatInkOpenFromBody,
	formatPageBreak as rapierFormatPageBreak, isPageBreakLine as rapierIsPageBreakLine,
	isPageBreakBlock as rapierIsPageBreakBlock,
} from '../spec/md-marks.mjs';
import {THEMATIC_BREAK as rapierThematicBreak, HARD_BREAK as rapierHardBreak, cellBreaks as rapierCellBreaks, parseCssColor as rapierParseCssColor,
	highlightOfStyle as rapierHighlightOfStyle, highlightRun as rapierHighlightRun, HIGHLIGHT_HEX as RAPIER_HIGHLIGHT_HEX, highlightOpen as rapierHighlightOpen,
	cellAlignment as rapierCellAlignment, delimiterRow as rapierDelimiterRow, htmlBlockLines as rapierHtmlBlockLines,
	codeLanguage as rapierCodeLanguage, codeBlock as rapierCodeBlock, scriptRun as rapierScriptRun,
	definitionList as rapierDefinitionList, detailsBlock as rapierDetailsBlock, orderedListExpressible as rapierOrderedListExpressible,
	linkTitle as rapierLinkTitle, markRuns as rapierMarkRuns,
	listIsLoose as rapierListIsLoose, wordListLevel as rapierWordListLevel, wordListIsMarker as rapierWordListIsMarker,
	wordListMarker as rapierWordListMarker, wordListTree as rapierWordListTree} from '../spec/html-reading.mjs';
const RAPIER_HIGHLIGHT_COLORS = Object.freeze({
	green: '🟢',
	red: '🔴',
	blue: '🔵',
	yellow: '🟡',
	purple: '🟣',
});
const RAPIER_MARKDOWN_SPEC = Object.freeze({
	options: Object.freeze({ html: true, linkify: true, typographer: false }),
	linkify: Object.freeze({ fuzzyLink: true }),
	core: Object.freeze({ retainReferenceDefinitions: true }),
	highlights: RAPIER_HIGHLIGHT_COLORS,
	callouts: Object.freeze({
		note: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
		tip: '<path d="M9 18v-2a6 6 0 1 1 6 0v2M9 18h6M10 22h4"/>',
		important: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
		warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
		caution: '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
	}),
	plugins: Object.freeze([
		Object.freeze({ global: 'markdownitTaskLists', options: Object.freeze({ enabled: true }) }),
		Object.freeze({ global: 'markdownitFootnote' }),
		Object.freeze({ global: 'markdownitMark' }),
		Object.freeze({ global: 'markdownitSup' }),
		Object.freeze({ global: 'markdownitEmoji' }),
		Object.freeze({ global: 'markdownitAbbr' }),
		Object.freeze({ global: 'markdownitIns' }),
		Object.freeze({ global: 'markdownitDeflist' }),
	]),
	rules: Object.freeze({ mathBlock: 'temml_math_block' }),
});

function _rapierApplyMarkdownSpec(instance, root, spec = RAPIER_MARKDOWN_SPEC) {
	const pluginSpecs = Array.from(spec.plugins || []);
	const missing = pluginSpecs
		.map(pluginSpec => pluginSpec.global)
		.filter(globalName => !root || typeof root[globalName] !== 'function');
	if (missing.length) throw new Error('Required Markdown runtime missing: ' + missing.join(', '));
	if (spec.linkify && (!instance.linkify || typeof instance.linkify.set !== 'function')) {
		throw new Error('Markdown linkifier unavailable');
	}
	if (spec.core && spec.core.retainReferenceDefinitions && (!instance.core || !instance.core.ruler)) {
		throw new Error('Markdown core ruler unavailable');
	}

	for (const pluginSpec of pluginSpecs) {
		const plugin = root[pluginSpec.global];
		if (pluginSpec.options) instance.use(plugin, pluginSpec.options);
		else instance.use(plugin);
	}
	if (!instance.__rapierFontsInstalled) {
		const validate = instance.validateLink;
		instance.validateLink = url => !!rapierFontDataUrl(url) || validate(url);
		instance.__rapierFontsInstalled = true;
	}
	instance.renderer.rules.s_open = (tokens, index, _options, _env, renderer) =>
		'<del' + renderer.renderAttrs(tokens[index]) + '>';
	instance.renderer.rules.s_close = () => '</del>';
	const SINGLE = -0x7e, strikeRule = instance.inline.ruler.__rules__.find(rule => rule.name === 'strikethrough').fn;
	instance.inline.ruler.at('strikethrough', function rapierStrikeDelimiter(state, silent) {
		if (!silent && state.src.charCodeAt(state.pos) === 0x7e) {
			const scanned = state.scanDelims(state.pos, true);
			if (scanned.length > 2) {
				state.push('text', '', 0).content = state.src.slice(state.pos, state.pos + scanned.length);
				state.pos += scanned.length;
				return true;
			}
			if (scanned.length === 1) {
				state.push('text', '', 0).content = '~';
				state.delimiters.push({marker: SINGLE, length: 0, token: state.tokens.length - 1, end: -1,
					open: scanned.can_open, close: scanned.can_close});
				state.pos++;
				return true;
			}
		}
		return strikeRule(state, silent);
	});
	instance.inline.ruler2.after('strikethrough', 'rapier-single-tilde', function rapierSingleTilde(state) {
		for (const delimiters of [state.delimiters, ...state.tokens_meta.map(meta => meta && meta.delimiters)]) {
			for (const open of delimiters || []) {
				if (open.marker !== SINGLE || open.end < 0) continue;
				for (const [at, type, nesting] of [[open.token, 's_open', 1], [delimiters[open.end].token, 's_close', -1]])
					Object.assign(state.tokens[at], {type, tag: 's', nesting, markup: '~', content: ''});
			}
		}
	});
	const render = instance.renderer.render;
	instance.renderer.rapierTransformHtml = html => html.replace(
			/<blockquote>\s*(<p(?:\s[^>]*)?>)\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER|INFO)\]\s*(?:<br\s*\/?>)?\s*/gi,
			(_match, paragraph, value) => {
				const type = value.toLowerCase(), icons = spec.callouts;
				const icon = icons[type === 'info' ? 'note' : type === 'danger' ? 'caution' : type];
				return '<blockquote class="callout callout-' + type + '">' + paragraph + '<span class="callout__label">' +
					'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
					icon + '</svg>' + type[0].toUpperCase() + type.slice(1) + '</span>';
			}
		);
	instance.renderer.render = function (tokens, options, env) {
		return this.rapierTransformHtml(render.call(this, tokens, options, env));
	};

	{
		const taskLists = instance.core.ruler.__rules__.find(rule => rule.name === 'github-task-lists').fn;
		instance.core.ruler.at('github-task-lists', function rapierTaskLists(state) {
			const stranded = [], levels = new Set();
			for (const token of state.tokens) {
				if (token.type === 'list_item_open' && !levels.has(token.level - 1)) stranded.push(token);
				levels.add(token.level);
			}
			for (const item of stranded) item.type = '';
			try { taskLists(state); } finally { for (const item of stranded) item.type = 'list_item_open'; }
		});
		instance.core.ruler.after('github-task-lists', 'rapier-empty-task-lists', function rapierEmptyTaskLists(state) {
			const tokens = state.tokens || [];
			for (const token of tokens) {
				if (token?.type !== 'inline' || !Array.isArray(token.children)) continue;
				for (const child of token.children) {
					if (child?.type === 'html_inline' && typeof child.content === 'string' &&
							child.content.includes('"type="checkbox"')) {
						child.content = child.content.replace('"type="checkbox"', '" type="checkbox"');
					}
				}
			}
			const addClass = (token, className) => {
				if (!token) return;
				const current = token.attrGet('class') || '';
				const classes = current.split(/\s+/).filter(Boolean);
				if (classes.includes(className)) return;
				classes.push(className);
				token.attrSet('class', classes.join(' '));
			};
			const owningList = itemIndex => {
				const targetLevel = tokens[itemIndex].level - 1;
				for (let index = itemIndex - 1; index >= 0; index--) {
					const token = tokens[index];
					if (token.level < targetLevel) break;
					if (token.level === targetLevel &&
							(token.type === 'bullet_list_open' || token.type === 'ordered_list_open')) return token;
				}
				return null;
			};
			for (let index = 2; index < tokens.length; index++) {
				const inline = tokens[index];
				const paragraph = tokens[index - 1];
				const item = tokens[index - 2];
				if (inline?.type !== 'inline' || paragraph?.type !== 'paragraph_open' || item?.type !== 'list_item_open') continue;
				if (!/^\[(?: |x|X)\]$/.test(inline.content || '')) continue;
				if (!Array.isArray(inline.children) || inline.children.length !== 1 || inline.children[0].type !== 'text') continue;
				const checked = inline.content[1] === 'x' || inline.content[1] === 'X';
				const checkbox = new state.Token('html_inline', '', 0);
				checkbox.content = '<input class="task-list-item-checkbox"' +
					(checked ? ' checked=""' : '') + ' type="checkbox">';
				inline.children = [checkbox];
				inline.content = '';
				addClass(item, 'task-list-item');
				addClass(item, 'enabled');
				addClass(owningList(index - 2), 'contains-task-list');
			}
		});
	}

	const highlightMarkers = Object.values(spec.highlights || {});
	if (highlightMarkers.length) {
		instance.inline.ruler.at('mark', function rapierMarkDelimiter(state, silent) {
			const start = state.pos;
			const marker = state.src.charCodeAt(start);
			if (silent || marker !== 0x3d) return false;
			const scanned = state.scanDelims(start, true);
			let length = scanned.length;
			if (length < 2) return false;
			if (length % 2) {
				state.push('text', '', 0).content = '=';
				length--;
			}
			const markerAfterRun = highlightMarkers.some(value =>
				state.src.startsWith(value, start + scanned.length));
			for (let offset = 0; offset < length; offset += 2) {
				state.push('text', '', 0).content = '==';
				const lastPair = offset + 2 === length;
				const canOpen = scanned.can_open || (lastPair && markerAfterRun);
				if (canOpen || scanned.can_close) {
					state.delimiters.push({
						marker,
						length: 0,
						jump: offset / 2,
						token: state.tokens.length - 1,
						end: -1,
						open: canOpen,
						close: scanned.can_close,
					});
				}
			}
			state.pos += scanned.length;
			return true;
		});
	}
	{
		const blockRules = instance.block && instance.block.ruler && instance.block.ruler.__rules__;
		const htmlBlockRule = Array.isArray(blockRules) ? blockRules.find(function (rule) { return rule.name === 'html_block'; }) : null;
		if (htmlBlockRule && typeof htmlBlockRule.fn === 'function' && !htmlBlockRule.fn.rapierInkAware) {
			const originalHtmlBlock = htmlBlockRule.fn;
			const inkAwareHtmlBlock = function rapierInkAwareHtmlBlock(state, startLine, endLine, silent) {
				const start = state.bMarks[startLine] + state.tShift[startLine];
				if (state.src.charCodeAt(start) === 0x3C && rapierMatchInkOpen(state.src.slice(start, start + 2048))) return false;
				return originalHtmlBlock(state, startLine, endLine, silent);
			};
			inkAwareHtmlBlock.rapierInkAware = true;
			instance.block.ruler.at('html_block', inkAwareHtmlBlock, { alt: ['paragraph', 'reference', 'blockquote'] });
		}
		rapierTypography.install(instance);
		instance.core.ruler.after('rapier-typography', 'rapier-ink', function rapierInkPairs(state) {
			for (const blockToken of state.tokens) {
				if (blockToken.type !== 'inline' || !Array.isArray(blockToken.children)) continue;
				const children = blockToken.children;
				const stack = [];
				let depth = 0;
				for (let index = 0; index < children.length; index++) {
					const token = children[index];
					if (token.type !== 'html_inline') {
						depth += token.nesting || 0;
						while (stack.length && depth < stack.at(-1).depth) stack.pop();
						continue;
					}
					const content = token.content;
					if (rapierIsInkClose(content)) {
						if (!stack.length || depth !== stack.at(-1).depth) continue;
						const opener = children[stack.pop().index];
						opener.type = 'rapier_ink_open';
						opener.tag = 'span';
						opener.nesting = 1;
						opener.attrSet('data-rapier-ink', rapierInkOpenBody(opener.content));
						opener.content = '';
						token.type = 'rapier_ink_close';
						token.tag = 'span';
						token.nesting = -1;
						token.content = '';
						continue;
					}
					if (rapierParseInkOpen(content)) stack.push({index, depth});
				}
			}
		});
	}
	{
		instance.core.ruler.after('block', 'rapier-page-break', function rapierPageBreak(state) {
			for (const token of state.tokens) {
				if (token.type !== 'html_block' || !rapierIsPageBreakBlock(token.content)) continue;
				token.type = 'rapier_break';
				token.tag = 'div';
				token.content = '';
			}
		});
	}
	instance.core.ruler.after('block', 'rapier-fence-boundaries', function rapierFenceBoundaries(state) {
		for (const token of state.tokens) {
			if (token.type !== 'fence' || !token.map) continue;
			const body = token.content;
			let lines = body && !body.endsWith('\n') ? 1 : 0;
			for (let at = body.indexOf('\n'); at >= 0; at = body.indexOf('\n', at + 1)) lines++;
			token.meta = { ...token.meta, rapierFenceClosed: token.map[1] - token.map[0] === lines + 2 };
		}
	});
	if (spec.linkify) {
		const linkify = instance.linkify;
		linkify.set(spec.linkify);
		const fuzzyCandidate = /@|\.[^ \t\n\v\f\r]/;
		const nativeTest = linkify.test;
		linkify.test = function (source) {
			if (!fuzzyCandidate.test(source)) {
				const schema = this.re.get_schema_search();
				schema.lastIndex = 0;
				if (!schema.test(source)) return false;
			}
			return nativeTest.call(this, source);
		};
		const allowedStart = (source, index) => index === 0 || /[ \t\n\v\f\r*_~(]/.test(source[index - 1]);
		linkify.add('www.', {
			validate(source, start) {
				const host = /^[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)+/u.exec(source.slice(start - 4));
				if (!host || host[0].split('.').slice(-2).some(label => label.includes('_'))) return 0;
				return host[0].length - 4;
			},
			normalize(match) { match.url = 'http://' + match.raw; },
		});
		linkify.add('xmpp:', {
			validate(source, start) {
				const address = /^[a-z\d._+-]+@([a-z\d_-]+(?:\.[a-z\d_-]+)+)/i.exec(source.slice(start));
				if (!address || /[-_]$/.test(address[1]) || source[start + address[0].length] === '+') return 0;
				const resource = /^\/[a-z\d@.]+/i.exec(source.slice(start + address[0].length));
				return address[0].length + (resource ? resource[0].length : 0);
			},
		});
		const refineLink = (match, source) => {
			if (!match) return match;
			const www = match.schema === 'www.' || (!match.schema && /^www\./i.test(match.raw));
			const web = www || match.schema === 'http:' || match.schema === 'https:';
			const email = match.schema === 'mailto:' || match.schema === 'xmpp:';
			if ((web || email) && !allowedStart(source, match.index)) return null;
			if (email && match.raw.slice(match.raw.indexOf('@') + 1).split('/')[0].includes('+')) return null;
			if (!web) return match;
			let end = match.index;
			while (end < source.length && !/[ \t\n\v\f\r<]/.test(source[end])) end++;
			while (end > match.index && /[?!.,:*_~]/.test(source[end - 1])) end--;
			let raw = source.slice(match.index, end);
			if (raw.endsWith(')')) {
				let extra = 0;
				for (const character of raw) extra += character === ')' ? 1 : character === '(' ? -1 : 0;
				while (extra > 0 && raw.endsWith(')')) { raw = raw.slice(0, -1); extra--; }
			}
			raw = raw.replace(/&[a-z\d]+;$/i, '');
			match.lastIndex = match.index + raw.length;
			match.raw = match.text = raw;
			match.url = www ? 'http://' + raw : raw;
			return match;
		};
		const nativeMatch = linkify.match;
		linkify.match = function (source) {
			const matches = nativeMatch.call(this, source);
			if (!matches) return matches;
			const result = [];
			let end = 0;
			for (const match of matches) {
				if (match.index < end) continue;
				const refined = refineLink(match, source);
				if (refined) { result.push(refined); end = refined.lastIndex; }
			}
			return result;
		};
		const nativeMatchAtStart = linkify.matchAtStart;
		linkify.matchAtStart = function (source) { return refineLink(nativeMatchAtStart.call(this, source), source); };
		const inlineLinkify = instance.inline.ruler.__rules__.find(rule => rule.name === 'linkify').fn;
		instance.inline.ruler.at('linkify', function rapierInlineLinkify(state, silent) {
			if (state.src.charCodeAt(state.pos) === 0x3a) {
				const prefix = state.src.slice(Math.max(0, state.pos - 5), state.pos).toLowerCase();
				const width = prefix.endsWith('https') ? 5 : prefix.endsWith('http') ? 4 : 0;
				if (width && !allowedStart(state.src, state.pos - width)) return false;
			}
			return inlineLinkify(state, silent);
		});
	}
	const disallowedTag = /<\/?(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?=[ \t\n\v\f\r/>])/gi;
	instance.core.ruler.push('rapier-tagfilter', function rapierTagfilter(state) {
		const filter = token => {
			if (token.type === 'html_inline' || token.type === 'html_block') {
				token.content = token.content.replace(disallowedTag, tag => '&lt;' + tag.slice(1));
			}
		};
		for (const token of state.tokens) {
			filter(token);
			if (token.type === 'inline') for (const child of token.children || []) filter(child);
		}
	});
	if (spec.core && spec.core.retainReferenceDefinitions) {
		instance.core.ruler.disable('strip_references');
	}
	return instance;
}


function _rapierSourceCharEscaped(source, index) {
	let slashes = 0;
	for (let cursor = index - 1; cursor >= 0 && source.charCodeAt(cursor) === 0x5c; cursor--) slashes++;
	return (slashes & 1) === 1;
}
function _rapierInstallMarkdownMath(instance, ruleName) {
	installMathRules(instance, {singleDollar: true, brackets: false, inLink: true, ruleName});
}

function safeCodeFence(body, authored = '```', info = '') {
	const marker = String(authored).startsWith('~') || String(info).includes('`') ? '~' : '`';
	let size = Math.max(3, (String(authored).match(new RegExp('^' + marker + '+')) || [''])[0].length);
	for (const match of String(body).matchAll(new RegExp('^ {0,3}(' + marker + '{3,})[ \t]*\r?$', 'gm'))) {
		size = Math.max(size, match[1].length + 1);
	}
	return marker.repeat(size);
}

export {
	createMathMatcher, installMathRules,
	safeCodeFence,
	RAPIER_HIGHLIGHT_COLORS, RAPIER_MARKDOWN_SPEC, _rapierApplyMarkdownSpec as applyMarkdownSpec,
	_rapierSourceCharEscaped as sourceCharEscaped, _rapierInstallMarkdownMath as installMarkdownMath,
	_rapierSplitOpeningFrontmatter as splitOpeningFrontmatter,
	_rapierReadDocumentSettings as readDocumentSettings, _rapierUpdateDocumentSettings as updateDocumentSettings, RAPIER_DOCUMENT_LEADING as DOCUMENT_LEADING, _rapierDocumentTitle as documentTitle,
	_rapierDocumentLanguage as documentLanguage,
	_rapierDocumentSettingsStyle as documentSettingsStyle, _rapierDocumentSettingsPageRule as documentSettingsPageRule,
	_rapierDocumentFont as documentFont, _rapierWriteDocumentFontSetting as writeDocumentFontSetting,
	rapierFontDataUrl as fontDataUrl, rapierFontAssetKey as fontAssetKey, rapierReadFontAssets as readFontAssets,
	rapierWriteFontAssets as writeFontAssets, rapierSerializeFontAsset as serializeFontAsset,
	rapierDocumentFontsCss as documentFontsCss, rapierDocumentFontUsage as documentFontUsage,
	RAPIER_TEXT_COLOR_NAMES, RAPIER_PAGE_BREAK_MARKER, rapierFormatColorRun as formatColorRun,
	rapierPairMarkers as pairMarkers, rapierQuotedWillSpan as quotedWillSpan,
	RAPIER_FONT_STACKS, rapierTypography as typography, rapierTypographySourceRanges as typographySourceRanges, rapierCreateTypography as createTypography, rapierNormalizeFontFamily as normalizeFontFamily, rapierFontFamilyCss as fontFamilyCss,
	rapierFormatFontRun as formatFontRun,
	RAPIER_INK_KINDS, RAPIER_INK_CLOSE, RAPIER_INK_PATH_MAX, RAPIER_INK_INT_MAX,
	RAPIER_INK_KINDS as INK_KINDS, RAPIER_INK_CLOSE as INK_CLOSE, RAPIER_INK_PATH_MAX as INK_PATH_MAX, RAPIER_INK_INT_MAX as INK_INT_MAX,
	rapierFormatInkOpen as formatInkOpen, rapierFormatInkRun as formatInkRun,
	rapierMatchInkOpen as matchInkOpen, rapierParseInkOpen as parseInkOpen,
	rapierInkOpenBody as inkOpenBody, rapierParseInkBody as parseInkBody,
	rapierIsInkClose as isInkClose, rapierScanInkMarkers as scanInkMarkers,
	rapierPairInkMarkers as pairInkMarkers, rapierStripInkMarkers as stripInkMarkers,
	rapierPairInkSpans as pairInkSpans, rapierSliceInkArrows as sliceInkArrows, rapierPrepareInkPaste as prepareInkPaste,
	rapierHasInkMarker as hasInkMarker, RAPIER_INK_OPEN_PATTERN as INK_OPEN_PATTERN,
	rapierReadInkMatch as readInkMatch, rapierFormatInkOpenFromBody as formatInkOpenFromBody,
	rapierFormatPageBreak as formatPageBreak, rapierIsPageBreakLine as isPageBreakLine,
	rapierIsPageBreakBlock as isPageBreakBlock,
	rapierThematicBreak as thematicBreak, rapierHardBreak as hardBreak, rapierCellBreaks as cellBreaks, rapierParseCssColor as parseCssColor,
	rapierHighlightOfStyle as highlightOfStyle, rapierHighlightRun as highlightRun, RAPIER_HIGHLIGHT_HEX, rapierHighlightOpen as highlightOpen,
	rapierCellAlignment as cellAlignment, rapierDelimiterRow as delimiterRow, rapierHtmlBlockLines as htmlBlockLines,
	rapierCodeLanguage as codeLanguage, rapierCodeBlock as codeBlock, rapierScriptRun as scriptRun,
	rapierDefinitionList as definitionList, rapierDetailsBlock as detailsBlock, rapierOrderedListExpressible as orderedListExpressible,
	rapierLinkTitle as linkTitle, rapierMarkRuns as markRuns,
	rapierListIsLoose as listIsLoose,
	rapierWordListLevel as wordListLevel, rapierWordListIsMarker as wordListIsMarker,
	rapierWordListMarker as wordListMarker, rapierWordListTree as wordListTree,
};

export {mayRetireInk};
