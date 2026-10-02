import {splitOpeningFrontmatter as _rapierSplitOpeningFrontmatter} from '../spec/frontmatter.mjs';

// One Markdown grammar serves the editor, parse worker and Node agent.
// SPDX-License-Identifier: AGPL-3.0-only
import {
	TEXT_COLOR_NAMES as RAPIER_TEXT_COLOR_NAMES,
	COLOR_CLOSE as RAPIER_COLOR_CLOSE, PAGE_BREAK_MARKER as RAPIER_PAGE_BREAK_MARKER,
	formatColorOpen as rapierFormatColorOpen, formatColorRun as rapierFormatColorRun,
	matchColorOpen as rapierMatchColorOpen, parseColorOpen as rapierParseColorOpen,
	isColorClose as rapierIsColorClose, scanColorMarkers as rapierScanColorMarkers,
	pairColorMarkers as rapierPairColorMarkers, pairMarkers as rapierPairMarkers,
	stripColorMarkers as rapierStripColorMarkers, hasColorMarker as rapierHasColorMarker,
	INK_KINDS as RAPIER_INK_KINDS, INK_CLOSE as RAPIER_INK_CLOSE,
	INK_PATH_MAX as RAPIER_INK_PATH_MAX, INK_INT_MAX as RAPIER_INK_INT_MAX,
	formatInkOpen as rapierFormatInkOpen, formatInkRun as rapierFormatInkRun,
	matchInkOpen as rapierMatchInkOpen, parseInkOpen as rapierParseInkOpen,
	inkOpenBody as rapierInkOpenBody, parseInkBody as rapierParseInkBody,
	isInkClose as rapierIsInkClose, scanInkMarkers as rapierScanInkMarkers,
	pairInkMarkers as rapierPairInkMarkers, stripInkMarkers as rapierStripInkMarkers,
	hasInkMarker as rapierHasInkMarker,
	formatPageBreak as rapierFormatPageBreak, isPageBreakLine as rapierIsPageBreakLine,
	isPageBreakBlock as rapierIsPageBreakBlock,
} from '../spec/md-marks.mjs';
// The spellings both HTML readers write (the paste door's Turndown and Notes import): one owner.
import {THEMATIC_BREAK as rapierThematicBreak, HARD_BREAK as rapierHardBreak, cellBreaks as rapierCellBreaks, parseCssColor as rapierParseCssColor,
	highlightOfStyle as rapierHighlightOfStyle, highlightRun as rapierHighlightRun,
	cellAlignment as rapierCellAlignment, alignmentDelimiter as rapierAlignmentDelimiter,
	codeLanguage as rapierCodeLanguage, linkTitle as rapierLinkTitle, markRuns as rapierMarkRuns,
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
	// Feather SVG paths; the matching lightbulb is Rapier's (Feather has no bulb).
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
		Object.freeze({ global: 'markdownitSub' }),
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
	// GFM strikethrough renders <del>; tokens, offsets and authored <s> untouched.
	instance.renderer.rules.s_open = (tokens, index, _options, _env, renderer) =>
		'<del' + renderer.renderAttrs(tokens[index]) + '>';
	instance.renderer.rules.s_close = () => '</del>';
	// Rendered chrome only: source tokens and their offsets stay untouched.
	const render = instance.renderer.render;
	instance.renderer.render = function (tokens, options, env) {
		return render.call(this, tokens, options, env).replace(
			/<blockquote>\s*(<p(?:\s[^>]*)?>)\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER|INFO)\]\s*(?:<br\s*\/?>)?\s*/gi,
			(_match, paragraph, value) => {
				const type = value.toLowerCase(), icons = spec.callouts;
				const icon = icons[type === 'info' ? 'note' : type === 'danger' ? 'caution' : type];
				return '<blockquote class="callout callout-' + type + '">' + paragraph + '<span class="callout__label">' +
					'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
					icon + '</svg>' + type[0].toUpperCase() + type.slice(1) + '</span>';
			}
		);
	};

	{
		instance.core.ruler.after('github-task-lists', 'rapier-empty-task-lists', function rapierEmptyTaskLists(state) {
			const tokens = state.tokens || [];
			// Pinned markdown-it-task-lists 2.1.0 writes two attributes with no space between when enabled; the vendor is byte-pinned, so repaired here.
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
	// Local constants survive parse-worker reconstruction; pairs must remain at the same inline depth.
	{
		// A leading colour comment must not make CommonMark swallow the paragraph as raw HTML.
		const blockRules = instance.block && instance.block.ruler && instance.block.ruler.__rules__;
		const htmlBlockRule = Array.isArray(blockRules) ? blockRules.find(function (rule) { return rule.name === 'html_block'; }) : null;
		if (htmlBlockRule && typeof htmlBlockRule.fn === 'function' && !htmlBlockRule.fn.rapierColorAware) {
			const originalHtmlBlock = htmlBlockRule.fn;
			const colorAwareHtmlBlock = function rapierColorAwareHtmlBlock(state, startLine, endLine, silent) {
				const start = state.bMarks[startLine] + state.tShift[startLine];
				if (state.src.charCodeAt(start) === 0x3C && rapierMatchColorOpen(state.src.slice(start, start + 30))) return false;
				return originalHtmlBlock(state, startLine, endLine, silent);
			};
			colorAwareHtmlBlock.rapierColorAware = true;
			instance.block.ruler.at('html_block', colorAwareHtmlBlock, { alt: ['paragraph', 'reference', 'blockquote'] });
		}
		instance.core.ruler.after('linkify', 'rapier-text-color', function rapierTextColorPairs(state) {
			for (const blockToken of state.tokens) {
				if (blockToken.type !== 'inline' || !Array.isArray(blockToken.children)) continue;
				const children = blockToken.children;
				let openIndex = -1, openHex = '', openDepth = 0, depth = 0;
				for (let index = 0; index < children.length; index++) {
					const token = children[index];
					if (token.type !== 'html_inline') {
						depth += token.nesting || 0;
						if (openIndex !== -1 && depth < openDepth) openIndex = -1;
						continue;
					}
					const content = token.content;
					if (rapierIsColorClose(content)) {
						if (openIndex === -1 || depth !== openDepth) continue; // orphan or wrong-depth: inert
						const opener = children[openIndex];
						opener.type = 'rapier_color_open';
						opener.tag = 'span';
						opener.nesting = 1;
						opener.content = '';
						opener.attrSet('data-md-color', openHex);
						token.type = 'rapier_color_close';
						token.tag = 'span';
						token.nesting = -1;
						token.content = '';
						openIndex = -1;
						continue;
					}
					const hex = rapierParseColorOpen(content);
					if (hex == null || openIndex !== -1) continue;
					openIndex = index;
					openHex = hex;
					openDepth = depth;
				}
			}
		});
	}
	// Retypes a block whose sole content is PAGE_BREAK_MARKER (spec/md-marks.mjs); anything else stays an inert comment.
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
			// The parser's span includes the opener and an explicit closer, when present.
			// Its body has container prefixes removed, so quotes/lists need no second fence grammar.
			const body = token.content;
			let lines = body && !body.endsWith('\n') ? 1 : 0;
			for (let at = body.indexOf('\n'); at >= 0; at = body.indexOf('\n', at + 1)) lines++;
			token.meta = { ...token.meta, rapierFenceClosed: token.map[1] - token.map[0] === lines + 2 };
		}
	});
	if (spec.linkify) instance.linkify.set(spec.linkify);
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
	function _rapierFindMathCloser(source, bodyStart, marker) {
		const display = marker === '$$';
		const max = source.length - marker.length;
		for (let cursor = bodyStart; cursor <= max; cursor++) {
			if (source.charCodeAt(cursor) !== 0x24 || _rapierSourceCharEscaped(source, cursor)) continue;
			if (display) {
				if (source.charCodeAt(cursor + 1) === 0x24 && source.charCodeAt(cursor + 2) !== 0x24) return cursor;
				cursor += source.charCodeAt(cursor + 1) === 0x24 ? 1 : 0;
				continue;
			}
			if (source.charCodeAt(cursor + 1) === 0x24 || source.charCodeAt(cursor - 1) === 0x24) continue;
			return cursor;
		}
		return -1;
	}
	instance.inline.ruler.before('escape', 'temml_math', function mathRule(state, silent) {
		const start = state.pos;
		if (state.src.charCodeAt(start) !== 0x24 /* $ */ || _rapierSourceCharEscaped(state.src, start)) return false;
		const isDisplay = state.src.charCodeAt(start + 1) === 0x24;
		const marker = isDisplay ? '$$' : '$';
		const bodyStart = start + marker.length;
		if (state.src.charCodeAt(bodyStart) === 0x24) return false;
		if (!isDisplay && /\s/.test(state.src.charAt(bodyStart))) return false;
		const end = _rapierFindMathCloser(state.src, bodyStart, marker);
		if (end < 0) return false;
		if (!isDisplay) {
			const body = state.src.slice(bodyStart, end);
			if (/[\n]/.test(body) || /^\s|\s$/.test(body)) return false;
			const after = state.src.charCodeAt(end + 1);
			if (after >= 0x30 && after <= 0x39) return false;
		}
		if (!silent) {
			const token = state.push(isDisplay ? 'math_block' : 'math_inline', '', 0);
			token.markup = marker;
			token.content = state.src.slice(bodyStart, end);
		}
		state.pos = end + marker.length;
		return true;
	});
	instance.block.ruler.before('fence', ruleName, function mathBlock(state, startLine, endLine, silent) {
		const pos = state.bMarks[startLine] + state.tShift[startLine];
		const max = state.eMarks[startLine];
		if (pos + 2 > max) return false;
		if (state.src.charCodeAt(pos) !== 0x24 || state.src.charCodeAt(pos + 1) !== 0x24) return false;

		const firstLine = state.src.slice(pos + 2, max);
		let content = '';
		let nextLine = startLine;
		const endIdx = firstLine.indexOf('$$');
		if (endIdx >= 0) {
			if (firstLine.slice(endIdx + 2).trim() !== '') return false;
			content = firstLine.slice(0, endIdx);
		} else {
			content = firstLine + '\n';
			nextLine = startLine + 1;
			while (nextLine < endLine) {
				const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
				const lineEnd = state.eMarks[nextLine];
				const line = state.src.slice(lineStart, lineEnd);
				const close = line.indexOf('$$');
				if (close >= 0) {
					if (line.slice(close + 2).trim() !== '') return false;
					content += line.slice(0, close);
					break;
				}
				content += line + '\n';
				nextLine++;
			}
			if (nextLine >= endLine) return false;
		}

		if (silent) return true;
		const token = state.push('math_block', 'math', 0);
		token.block = true;
		token.markup = '$$';
		token.content = content.trim();
		token.map = [startLine, nextLine + 1];
		state.line = nextLine + 1;
		return true;
	}, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
}

// CommonMark allows a closing fence after 0-3 spaces: selected code must never close its own wrapper.
function safeCodeFence(body, authored = '```', info = '') {
	const marker = String(authored).startsWith('~') || String(info).includes('`') ? '~' : '`';
	let size = Math.max(3, (String(authored).match(new RegExp('^' + marker + '+')) || [''])[0].length);
	for (const match of String(body).matchAll(new RegExp('^ {0,3}(' + marker + '{3,})[ \t]*\r?$', 'gm'))) {
		size = Math.max(size, match[1].length + 1);
	}
	return marker.repeat(size);
}

export {
	safeCodeFence,
	RAPIER_HIGHLIGHT_COLORS, RAPIER_MARKDOWN_SPEC, _rapierApplyMarkdownSpec as applyMarkdownSpec,
	_rapierSourceCharEscaped as sourceCharEscaped, _rapierInstallMarkdownMath as installMarkdownMath,
	_rapierSplitOpeningFrontmatter as splitOpeningFrontmatter,
	// The text-colour and page-break convention (spec/md-marks.mjs), passed through so the editor
	// and its Pandoc-dialect export call the one owner instead of repeating its comment grammar.
	RAPIER_TEXT_COLOR_NAMES, RAPIER_COLOR_CLOSE, RAPIER_PAGE_BREAK_MARKER,
	rapierFormatColorOpen as formatColorOpen, rapierFormatColorRun as formatColorRun,
	rapierMatchColorOpen as matchColorOpen, rapierParseColorOpen as parseColorOpen,
	rapierIsColorClose as isColorClose, rapierScanColorMarkers as scanColorMarkers,
	rapierPairColorMarkers as pairColorMarkers, rapierPairMarkers as pairMarkers,
	rapierStripColorMarkers as stripColorMarkers, rapierHasColorMarker as hasColorMarker,
	RAPIER_INK_KINDS, RAPIER_INK_CLOSE, RAPIER_INK_PATH_MAX, RAPIER_INK_INT_MAX,
	rapierFormatInkOpen as formatInkOpen, rapierFormatInkRun as formatInkRun,
	rapierMatchInkOpen as matchInkOpen, rapierParseInkOpen as parseInkOpen,
	rapierInkOpenBody as inkOpenBody, rapierParseInkBody as parseInkBody,
	rapierIsInkClose as isInkClose, rapierScanInkMarkers as scanInkMarkers,
	rapierPairInkMarkers as pairInkMarkers, rapierStripInkMarkers as stripInkMarkers,
	rapierHasInkMarker as hasInkMarker,
	rapierFormatPageBreak as formatPageBreak, rapierIsPageBreakLine as isPageBreakLine,
	rapierIsPageBreakBlock as isPageBreakBlock,
	rapierThematicBreak as thematicBreak, rapierHardBreak as hardBreak, rapierCellBreaks as cellBreaks, rapierParseCssColor as parseCssColor,
	rapierHighlightOfStyle as highlightOfStyle, rapierHighlightRun as highlightRun,
	rapierCellAlignment as cellAlignment, rapierAlignmentDelimiter as alignmentDelimiter,
	rapierCodeLanguage as codeLanguage, rapierLinkTitle as linkTitle, rapierMarkRuns as markRuns,
	rapierListIsLoose as listIsLoose,
	rapierWordListLevel as wordListLevel, rapierWordListIsMarker as wordListIsMarker,
	rapierWordListMarker as wordListMarker, rapierWordListTree as wordListTree,
};
