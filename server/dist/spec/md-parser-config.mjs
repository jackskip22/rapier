// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Jack Skipworth. See LICENSE-MIT.
// Feather callout paths retain the copyright and MIT notice in agent/vendor/NOTICE.txt.
import {tuneMarkdownEngine} from './md-engine.mjs';
import {fontDataUrl as rapierFontDataUrl, INK_OPEN_PREFIX, PAGE_BREAK_MARKER} from './md-marks.mjs';
import {typography as rapierTypography, matchInkOpen as rapierMatchInkOpen, isInkClose as rapierIsInkClose,
  inkOpenBody as rapierInkOpenBody, parseInkOpen as rapierParseInkOpen, isPageBreakBlock as rapierIsPageBreakBlock} from './md-marks.mjs';
import {installMathRules} from '../math/markdown-rules.mjs';

const RAPIER_HIGHLIGHT_COLORS = Object.freeze({
	green: '🟢',
	red: '🔴',
	blue: '🔵',
	yellow: '🟡',
	purple: '🟣',
});
const RAPIER_MARKDOWN_SPEC = Object.freeze({
	options: Object.freeze({ html: true, linkify: true, typographer: false, maxNesting: 1000 }),
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

const _rapierLinkifyCandidate = {names: null, schemaRe: null, anchors: null, tldsRef: null, tldSet: null, maxTld: 6};
function _rapierSchemaAnchors(names) {
	const anchors = new Set();
	for (const name of names) {
		if (name.includes(':')) anchors.add(':');
		else if (name.includes('/')) anchors.add('/');
		else if (name) { const first = String.fromCodePoint(name.codePointAt(0)); for (const c of first.toLowerCase() + first.toUpperCase()) anchors.add(c); }
	}
	return anchors.size ? new RegExp('[' + [...anchors].map(c => c.replace(/[\\\]^-]/g, '\\$&')).join('') + ']', 'u') : null;
}
function _rapierLinkFlags(text, linkify) {
	const len = text.length;
	if (len < 4) return 0;
	const names = linkify.re.get_schema_names();
	if (_rapierLinkifyCandidate.names !== names) {
		_rapierLinkifyCandidate.names = names;
		_rapierLinkifyCandidate.schemaRe = new RegExp(names.source, 'i');
		_rapierLinkifyCandidate.anchors = _rapierSchemaAnchors(Object.keys(linkify.__schemas__ || {}));
	}
	let flags = 0;
	if (_rapierLinkifyCandidate.anchors?.test(text) && _rapierLinkifyCandidate.schemaRe.test(text)) flags |= 1;
	const dotFirst = text.indexOf('.');
	if (dotFirst < 0) return flags;
	const atPos = text.indexOf('@');
	if (atPos > 0 && text.indexOf('.', atPos + 2) > 0) flags |= 4;
	if (!linkify.__opts__.fuzzyLink) return flags;
	if (linkify.__opts__.fuzzyIP && /\d\.\d/.test(text)) return flags | 2;
	const tlds = linkify.__opts__.tlds;
	if (_rapierLinkifyCandidate.tldsRef !== tlds) {
		_rapierLinkifyCandidate.tldsRef = tlds;
		const set = new Set();
		let max = 2;
		for (let i = 0; i < tlds.length; i++) {
			const t = tlds[i].toLowerCase();
			set.add(t);
			if (t.length > max) max = t.length;
		}
		_rapierLinkifyCandidate.tldSet = set;
		_rapierLinkifyCandidate.maxTld = max;
	}
	const tldSet = _rapierLinkifyCandidate.tldSet, maxTld = _rapierLinkifyCandidate.maxTld;
	for (let dot = dotFirst; dot !== -1 && dot + 2 < len; dot = text.indexOf('.', dot + 1)) {
		if (dot === 0) continue;
		const c1 = text.charCodeAt(dot + 1) | 32;
		if (!((c1 >= 0x61 && c1 <= 0x7a) || c1 > 127)) continue;
		if (c1 === 0x78 && (text.charCodeAt(dot + 2) | 32) === 0x6e && text.charCodeAt(dot + 3) === 0x2d && text.charCodeAt(dot + 4) === 0x2d) return flags | 2;
		let end = dot + 2;
		const limit = Math.min(len, dot + 1 + maxTld + 1);
		while (end < limit) {
			const c = text.charCodeAt(end);
			if ((c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a) || (c >= 0x30 && c <= 0x39) || c === 0x2d || c > 127) end++;
			else break;
		}
		const labelLen = end - (dot + 1);
		if (labelLen >= 2 && labelLen <= maxTld && tldSet.has(text.slice(dot + 1, end).toLowerCase())) return flags | 2;
	}
	return flags;
}
function _rapierMayContainLink(text, linkify) {
	return _rapierLinkFlags(text, linkify) !== 0;
}
function _rapierLinkifyText(state) {
	const md = state.md;
	if (!md.options.linkify) return;
	const linkify = md.linkify;
	for (let at = 0; at < state.tokens.length; at++) {
		const block = state.tokens[at];
		if (block.type !== 'inline' || !_rapierMayContainLink(block.content, linkify)) continue;
		const children = block.children;
		const source = block.content;
		let htmlDepth = 0, wholeSource, changes;
		for (let index = children.length - 1; index >= 0; index--) {
			const child = children[index];
			if (child.type === 'link_close') {
				index--;
				while (children[index].level !== child.level && children[index].type !== 'link_open') index--;
				continue;
			}
			if (child.type === 'html_inline') {
				if (/^<a[>\s]/i.test(child.content) && htmlDepth > 0) htmlDepth--;
				if (/^<\/a\s*>/i.test(child.content)) htmlDepth++;
			}
			if (htmlDepth || child.type !== 'text' || !_rapierMayContainLink(child.content, linkify)) continue;
			let matches = linkify.match(child.content);
			if (!matches?.length) continue;
			wholeSource ??= md.linkify.test(source);
			if (!wholeSource) break;
			if (matches[0].index === 0 && index > 0 && children[index - 1].type === 'text_special') matches = matches.slice(1);
			const replacement = [];
			let position = 0, level = child.level;
			const textToken = text => {
				const token = new state.Token('text', '', 0);
				token.content = text; token.level = level; replacement.push(token);
			};
			for (const match of matches) {
				const destination = md.normalizeLink(match.url);
				if (!md.validateLink(destination)) continue;
				if (match.index > position) textToken(child.content.slice(position, match.index));
				const open = new state.Token('link_open', 'a', 1);
				open.attrs = [['href', destination]]; open.level = level++;
				open.markup = 'linkify'; open.info = 'auto'; replacement.push(open);
				let label;
				if (!match.schema) label = md.normalizeLinkText('http://' + match.text).replace(/^http:\/\//, '');
				else if (match.schema === 'mailto:' && !/^mailto:/i.test(match.text)) label = md.normalizeLinkText('mailto:' + match.text).replace(/^mailto:/, '');
				else label = md.normalizeLinkText(match.text);
				textToken(label);
				const close = new state.Token('link_close', 'a', -1);
				close.level = --level; close.markup = 'linkify'; close.info = 'auto'; replacement.push(close);
				position = match.lastIndex;
			}
			if (position < child.content.length) textToken(child.content.slice(position));
			(changes ||= []).push({index, tokens: replacement});
		}
		if (changes) {
			const result = [];
			let next = changes.length - 1;
			for (let index = 0; index < children.length; index++) {
				const change = changes[next];
				if (change?.index === index) {
					for (const token of change.tokens) result.push(token);
					next--;
				}
				else result.push(children[index]);
			}
			block.children = result;
		}
	}
}

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

	tuneMarkdownEngine(instance);
	if (!instance.__rapierDeepFlat) {
		instance.block.ruler.before('table', 'rapier_deep_flat', (state, startLine, endLine, silent) => {
			if (silent || state.level < state.md.options.maxNesting - 2) return false;
			const content = state.getLines(startLine, endLine, state.blkIndent, false).trim();
			if (!content) return false;
			state.push('paragraph_open', 'p', 1).map = [startLine, endLine];
			const inline = state.push('inline', '', 0);
			inline.content = content; inline.map = [startLine, endLine]; inline.children = [];
			state.push('paragraph_close', 'p', -1);
			state.line = endLine;
			return true;
		});
		instance.__rapierDeepFlat = true;
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
		const retype = delimiters => {
			for (const open of delimiters || []) {
				if (open.marker !== SINGLE || open.end < 0) continue;
				for (const [at, type, nesting] of [[open.token, 's_open', 1], [delimiters[open.end].token, 's_close', -1]])
					Object.assign(state.tokens[at], {type, tag: 's', nesting, markup: '~', content: ''});
			}
		};
		retype(state.delimiters);
		for (const meta of state.tokens_meta) if (meta) retype(meta.delimiters);
	});
	const render = instance.renderer.render;
	instance.renderer.rapierTransformHtml = html => html.indexOf('[!') < 0 ? html : html.replace(
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
			if (state.src.indexOf('[') < 0) return;
			const stranded = [];
			let levelMask = 0;
			const levels = new Set();
			for (let at = 0; at < state.tokens.length; at++) {
				const token = state.tokens[at], lv = token.level;
				if (token.type === 'list_item_open') {
					const prev = lv - 1;
					if (!(prev >= 0 && prev < 31 ? (levelMask & (1 << prev)) : levels.has(prev))) stranded.push(token);
				}
				if (lv >= 0 && lv < 31) levelMask |= (1 << lv);
				else levels.add(lv);
			}
			for (const item of stranded) item.type = '';
			try { taskLists(state); } finally { for (const item of stranded) item.type = 'list_item_open'; }
		});
		instance.core.ruler.after('github-task-lists', 'rapier-empty-task-lists', function rapierEmptyTaskLists(state) {
			if (state.src.indexOf('[') < 0 && state.src.indexOf('"type="checkbox"') < 0) return;
			const tokens = state.tokens || [];
			for (let index = 0; index < tokens.length; index++) {
				const token = tokens[index];
				if (token?.type !== 'inline' || !Array.isArray(token.children)) continue;
				if (tokens[index - 2]?.type !== 'list_item_open' && !token.content.includes('"type="checkbox"')) continue;
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
				if (inline.content?.length !== 3) continue;
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
				if (state.src.charCodeAt(start) !== 0x3C) return false;
				if (state.src.startsWith(INK_OPEN_PREFIX, start) && rapierMatchInkOpen(state.src.slice(start, start + 2048))) return false;
				return originalHtmlBlock(state, startLine, endLine, silent);
			};
			inkAwareHtmlBlock.rapierInkAware = true;
			instance.block.ruler.at('html_block', inkAwareHtmlBlock, { alt: ['paragraph', 'reference', 'blockquote'] });
		}
		rapierTypography.install(instance);
		instance.core.ruler.after('rapier-typography', 'rapier-ink', function rapierInkPairs(state) {
			if (state.src.indexOf(INK_OPEN_PREFIX) < 0) return;
			for (let at = 0; at < state.tokens.length; at++) {
				const blockToken = state.tokens[at];
				if (blockToken.type !== 'inline' || !Array.isArray(blockToken.children) || blockToken.content.indexOf(INK_OPEN_PREFIX) < 0) continue;
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
			if (state.src.indexOf(PAGE_BREAK_MARKER) < 0) return;
			for (let at = 0; at < state.tokens.length; at++) {
				const token = state.tokens[at];
				if (token.type !== 'html_block' || !rapierIsPageBreakBlock(token.content)) continue;
				token.type = 'rapier_break';
				token.tag = 'div';
				token.content = '';
			}
		});
	}
	instance.core.ruler.after('block', 'rapier-fence-boundaries', function rapierFenceBoundaries(state) {
		for (let at = 0; at < state.tokens.length; at++) {
			const token = state.tokens[at];
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
		instance.core.ruler.at('linkify', _rapierLinkifyText);
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
		const nativeMatch = linkify.match, nativeTest = linkify.test;
		let MatchCtor = null;
		linkify.test = function (source) {
			const flags = _rapierLinkFlags(source, this);
			if (!flags) return false;
			return nativeTest.call(this, source);
		};
		linkify.match = function (source) {
			const flags = _rapierLinkFlags(source, this);
			if (!flags) return null;
			if (!MatchCtor) {
				const sample = nativeMatch.call(this, 'http://a.com');
				if (sample?.[0]) MatchCtor = Object.getPrototypeOf(sample[0]).constructor;
			}
			let matches;
			if (!MatchCtor || flags === 7) {
				matches = nativeMatch.call(this, source);
			} else {
				const list = [];
				const r = (flags & 1) ? this.re.get_schema_search() : null;
				const n = (flags & 2) && this.__opts__.fuzzyLink && this.__schemas__['http:'] ? this.re.get_fuzzy_link_search() : null;
				const s = (flags & 4) && this.__opts__.fuzzyEmail && this.__schemas__['mailto:'] ? this.re.get_fuzzy_mail_host_search() : null;
				const o = s ? this.re.get_mail_name_validator() : null;
				if (r) r.lastIndex = 0;
				if (n) n.lastIndex = 0;
				if (s) s.lastIndex = 0;
				let i, a, u, c = !r, l = !n, h = !s, p = 0;
				for (;;) {
					const f = Math.max(p - 1, 0);
					if (s && o && !h && (!a || a.index < p)) {
						if (s.lastIndex < f) s.lastIndex = f;
						for (;;) {
							const t = s.exec(source);
							if (!t) { h = true; a = undefined; break; }
							const m = o.exec(source.slice(Math.max(0, t.index - 65), t.index));
							if (m) {
								a = {schema: 'mailto:', index: t.index - m[1].length, lastIndex: t.index + t[0].length};
								if (a.index >= p) break;
								if (s.lastIndex < f) s.lastIndex = f;
							}
						}
					}
					if (n && !l && (!i || i.index < p)) {
						if (n.lastIndex < f) n.lastIndex = f;
						for (;;) {
							const t = n.exec(source);
							if (!t) { l = true; i = undefined; break; }
							i = {schema: '', index: t.index + t[1].length, lastIndex: t.index + t[0].length};
							if (i.index >= p) break;
							if (n.lastIndex < f) n.lastIndex = f;
						}
					}
					let d, g = a;
					if (!g || (i && (i.index < g.index || (i.index === g.index && i.lastIndex > g.lastIndex)))) g = i;
					if (!c) {
						for (;;) {
							if (!u) {
								if (r.lastIndex < f) r.lastIndex = f;
								const t = r.exec(source);
								if (!t) { c = true; break; }
								u = {schema: t[2], index: t.index + t[1].length, lastIndex: t.index + t[0].length};
							}
							if (u.index < p) { u = undefined; continue; }
							if (g && u.index > g.index) break;
							const t = u;
							u = undefined;
							const len = this.testSchemaAt(source, t.schema, t.lastIndex);
							if (len) { d = {schema: t.schema, index: t.index, lastIndex: t.lastIndex + len}; break; }
						}
					}
					let m = d;
					if (!m || (a && (a.index < m.index || (a.index === m.index && a.lastIndex > m.lastIndex)))) m = a;
					if (!m || (i && (i.index < m.index || (i.index === m.index && i.lastIndex > m.lastIndex)))) m = i;
					if (!m) break;
					if (m === a) a = undefined;
					else if (m === i) i = undefined;
					const item = new MatchCtor(source, m.schema, m.index, m.lastIndex);
					if (item.schema) this.__schemas__[item.schema].normalize(item, this);
					else this.normalize(item);
					list.push(item);
					p = m.lastIndex;
				}
				matches = list.length ? list : null;
			}
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
			const pos = state.pos, src = state.src;
			if (pos + 3 > state.posMax || src.charCodeAt(pos) !== 0x3a || src.charCodeAt(pos + 1) !== 0x2f || src.charCodeAt(pos + 2) !== 0x2f) return false;
			const prefix = src.slice(Math.max(0, pos - 5), pos).toLowerCase();
			const width = prefix.endsWith('https') ? 5 : prefix.endsWith('http') ? 4 : 0;
			if (width && !allowedStart(src, pos - width)) return false;
			return inlineLinkify(state, silent);
		});
	}
	const disallowedTag = /<\/?(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?=[ \t\n\v\f\r/>])/gi;
	const disallowedTest = /<\/?(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?=[ \t\n\v\f\r/>])/i;
	instance.core.ruler.push('rapier-tagfilter', function rapierTagfilter(state) {
		if (state.src.indexOf('<') < 0 || !disallowedTest.test(state.src)) return;
		const filter = token => {
			if ((token.type === 'html_inline' || token.type === 'html_block') && disallowedTest.test(token.content)) {
				token.content = token.content.replace(disallowedTag, tag => '&lt;' + tag.slice(1));
			}
		};
		for (let at = 0; at < state.tokens.length; at++) {
			const token = state.tokens[at];
			filter(token);
			if (token.type === 'inline' && token.content.indexOf('<') >= 0) for (const child of token.children || []) filter(child);
		}
	});
	const emojiRule = instance.core.ruler.__rules__.find(rule => rule.name === 'emoji');
	if (emojiRule) {
		const origEmoji = emojiRule.fn;
		const emojiQuickRe = /:|<3|<\/3|<\\3|[8BXx][-']?[()]/;
		instance.core.ruler.at('emoji', function rapierEmoji(state) {
			if (!emojiQuickRe.test(state.src)) return;
			origEmoji(state);
		});
	}
	if (spec.core && spec.core.retainReferenceDefinitions) {
		instance.core.ruler.disable('strip_references');
	}
	return instance;
}

function _rapierInstallMarkdownMath(instance, ruleName) {
	installMathRules(instance, {singleDollar: true, brackets: false, inLink: true, ruleName});
}

export {RAPIER_HIGHLIGHT_COLORS, RAPIER_MARKDOWN_SPEC, _rapierApplyMarkdownSpec as applyMarkdownSpec,
  _rapierInstallMarkdownMath as installMarkdownMath};
