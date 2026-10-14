// SPDX-License-Identifier: AGPL-3.0-only
import {RAPIER_HIGHLIGHT_COLORS, typography, typographySourceRanges,
  isPageBreakBlock as _rapierIsPageBreakBlock, splitOpeningFrontmatter as _rapierSplitOpeningFrontmatter} from '../agent/markdown-spec.mjs';

export function createPandocDialect(md, progress = null) {
const RAPIER_PANDOC_MARK_RE = /(?<!=)==(?!\s|=)([\s\S]*?[^\s=])==(?!=)/g;

function _rapierPandocDialectMaskCode(paragraph) {
	const store = [], state = new md.inline.State(paragraph, md, {}, []);
	let masked = '', copied = 0;
	while (state.pos < state.posMax) {
		const start = state.pos, char = paragraph[start];
		if (char !== '`' && char !== '\\' && char !== '<') {
			state.pos++; continue;
		}
		md.inline.skipToken(state);
		let openerEnd = start + 1;
		if (char === '`') while (paragraph[openerEnd] === '`') openerEnd++;
		if (state.pos <= openerEnd) continue;
		masked += paragraph.slice(copied, start) + '\u0000' + store.length + '\u0000';
		store.push(paragraph.slice(start, state.pos)); copied = state.pos;
	}
	return {masked: masked + paragraph.slice(copied), store};
}

function _rapierPandocDialectMaskLinks(masked, store) {
	if (!md || typeof md.parseInline !== 'function' || !md.helpers || typeof md.helpers.parseLinkDestination !== 'function') return masked;
	const view = masked.replace(/\u0000/g, 'X'), used = new Set(), replacements = [];
	let tokens;
	try { tokens = md.parseInline(view, {})[0]?.children || []; } catch (_) { return masked; }
	for (const token of tokens) {
		if (token.type !== 'link_open' && token.type !== 'image') continue;
		const destination = token.attrGet(token.type === 'image' ? 'src' : 'href');
		if (!destination) continue;
		for (let search = 0; ;) {
			const open = masked.indexOf('](', search);
			if (open === -1) break;
			search = open + 2;
			let start = search;
			while (start < masked.length && /[ \t\r\n]/.test(masked[start])) start++;
			if (used.has(start)) continue;
			const parsed = md.helpers.parseLinkDestination(view, start, view.length);
			if (parsed && parsed.ok && parsed.pos > start && md.normalizeLink(parsed.str) === destination) {
				let end = parsed.pos, titleStart = end;
				while (titleStart < masked.length && /[ \t\r\n]/.test(masked[titleStart])) titleStart++;
				if (titleStart > end) {
					const title = md.helpers.parseLinkTitle(view, titleStart, view.length);
					if (title.ok) end = title.pos;
				}
				const placeholder = '\u0000' + store.length + '\u0000';
				store.push(_rapierPandocDialectUnmaskCode(masked.slice(start, end), store));
				replacements.push({start, end, text: placeholder}); used.add(start);
				break;
			}
		}
	}
	return _rapierPandocDialectApplyReplacements(masked, replacements.sort((a, b) => a.start - b.start));
}
function _rapierPandocDialectUnmaskCode(text, store) {
	if (!store.length) return text;
	return text.replace(/\u0000(\d+)\u0000/g, (whole, index) => store[Number(index)] ?? whole);
}
function _rapierPandocDialectApplyReplacements(text, replacements) {
	if (!replacements.length) return text;
	let out = '', cursor = 0;
	for (const replacement of replacements) {
		out += text.slice(cursor, replacement.start) + replacement.text;
		cursor = replacement.end;
	}
	return out + text.slice(cursor);
}

function _rapierPandocDialectSpan(content, attributes) {
	const stack = [], literal = new Set();
	for (let at = 0; at < content.length; at++) {
		if (content[at] === '[') stack.push(at);
		else if (content[at] === ']') { if (stack.length) stack.pop(); else literal.add(at); }
	}
	for (const at of stack) literal.add(at);
	let out = '';
	for (let at = 0; at < content.length; at++) out += (literal.has(at) ? '\\' : '') + content[at];
	return '[' + out + ']{' + attributes + '}';
}

function typographyText(source, plain = false) {
	const text = String(source ?? ''), pairs = typographySourceRanges(text, md);
	if (plain) return _rapierPandocDialectApplyReplacements(text, pairs.flatMap(pair => [
		{start: pair.start, end: pair.innerStart, text: ''}, {start: pair.innerEnd, end: pair.end, text: ''},
	]).sort((a, b) => a.start - b.start));
	const root = {innerStart: 0, innerEnd: text.length, end: text.length, children: []}, stack = [root];
	for (const pair of pairs) {
		while (stack.length > 1 && pair.start >= stack.at(-1).innerEnd) stack.pop();
		const parent = stack.at(-1);
		if (pair.start < parent.innerStart || pair.end > parent.innerEnd) continue;
		const node = {...pair, children: []}; parent.children.push(node); stack.push(node);
	}
	const render = node => {
		let content = '', at = node.innerStart;
		for (const child of node.children) { content += text.slice(at, child.start) + render(child); at = child.end; }
		content += text.slice(at, node.innerEnd);
		if (node === root) return content;
		const {masked, store} = _rapierPandocDialectMaskCode(content);
		const attributes = 'style="' + typography.style(node.style).replace(/[\\"]/g, '\\$&') + '"';
		return _rapierPandocDialectUnmaskCode(_rapierPandocDialectSpan(_rapierPandocDialectMaskLinks(masked, store), attributes), store);
	};
	return render(root);
}
function _rapierPandocDialectFindMarkReplacements(paragraph) {
	const replacements = [];
	const markerValues = Object.values(RAPIER_HIGHLIGHT_COLORS);
	let match;
	RAPIER_PANDOC_MARK_RE.lastIndex = 0;
	while ((match = RAPIER_PANDOC_MARK_RE.exec(paragraph))) {
		let inner = match[1];
		for (const marker of markerValues) {
			if (inner.startsWith(marker) && inner.length > marker.length) { inner = inner.slice(marker.length); break; }
		}
		replacements.push({ start: match.index, end: match.index + match[0].length, text: _rapierPandocDialectSpan(inner, '.mark') });
	}
	return replacements;
}
function _rapierPandocDialectRewriteParagraph(paragraph) {
	if (_rapierIsPageBreakBlock(paragraph.replace(/\r\n?/g, '\n'))) return '\\newpage' + (/[\r\n]+$/.exec(paragraph)?.[0] || '');
	const { masked: maskedCode, store } = _rapierPandocDialectMaskCode(paragraph);
	const masked = _rapierPandocDialectMaskLinks(maskedCode, store);
	const afterMark = _rapierPandocDialectApplyReplacements(masked, _rapierPandocDialectFindMarkReplacements(masked));
	return _rapierPandocDialectUnmaskCode(afterMark, store);
}

function _rapierPandocDialectRewriteProse(chunk) {
	const parts = chunk.split(/((?:\r\n|\r(?!\n)|\n)[ \t]*(?:\r\n|\r(?!\n)|\n)(?:[ \t]*(?:\r\n|\r(?!\n)|\n))*)/);
	for (let index = 0; index < parts.length; index += 2) {
		const size = parts[index].length + (parts[index + 1]?.length || 0);
		parts[index] = _rapierPandocDialectRewriteParagraph(parts[index]); progress?.(size);
	}
	return parts.join('');
}

function _rapierPandocDialectExportText(source, parsedBlocks = null) {
	const text = String(source ?? ''), opening = _rapierSplitOpeningFrontmatter(text);
	const body = opening.body, starts = [0];
	for (let at = 0; at < body.length; at++) {
		if (body[at] === '\r') { if (body[at + 1] === '\n') at++; starts.push(at + 1); }
		else if (body[at] === '\n') starts.push(at + 1);
	}
	const blocks = parsedBlocks || md.parse(body, {}), ranges = [];
	for (const token of blocks) {
		if (!token.map || !(token.type === 'code_block' || token.type === 'fence' || token.type === 'reference_definition' ||
			token.type === 'html_block' && !_rapierIsPageBreakBlock(token.content))) continue;
		ranges.push([starts[token.map[0]], starts[token.map[1]] ?? body.length]);
	}
	ranges.sort((a, b) => a[0] - b[0]);
	let out = opening.frontmatter || '', cursor = 0;
	for (const [start, end] of ranges) {
		if (start < cursor) continue;
		out += _rapierPandocDialectRewriteProse(body.slice(cursor, start)) + body.slice(start, end); progress?.(end - start); cursor = end;
	}
	return typographyText(out + _rapierPandocDialectRewriteProse(body.slice(cursor)));
}

return {exportText: _rapierPandocDialectExportText, semanticText: source => typographyText(source, true)};
}
