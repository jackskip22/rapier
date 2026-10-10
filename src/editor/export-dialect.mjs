// SPDX-License-Identifier: AGPL-3.0-only
// One authored-source transform serves the reader and the cancellable copy worker.
import {RAPIER_HIGHLIGHT_COLORS, RAPIER_COLOR_CLOSE, matchColorOpen as _rapierMatchColorOpen,
  isPageBreakBlock as _rapierIsPageBreakBlock, splitOpeningFrontmatter as _rapierSplitOpeningFrontmatter} from '../agent/markdown-spec.mjs';

export function createPandocDialect(md, progress = null) {
const RAPIER_PANDOC_MARK_RE = /(?<!=)==(?!\s|=)([\s\S]*?[^\s=])==(?!=)/g;

function _rapierPandocDialectMaskCode(paragraph) {
	const store = [], state = new md.inline.State(paragraph, md, {}, []);
	let masked = '', copied = 0;
	while (state.pos < state.posMax) {
		const start = state.pos, char = paragraph[start];
		// The document parser owns code-span delimiters and backslash escapes. HTML tags,
		// comments and autolinks also keep their attributes/URLs, except our colour markers.
		if (char !== '`' && char !== '\\' && (char !== '<' ||
			_rapierMatchColorOpen(paragraph.slice(start, start + 40)) || paragraph.startsWith(RAPIER_COLOR_CLOSE, start))) {
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
	// NUL mask delimiters are not URL characters. A same-length neutral view lets the
	// real link reader see escaped destinations/titles without normalizing or truncating them.
	const view = masked.replace(/\u0000/g, 'X'), used = new Set(), replacements = [];
	let tokens;
	try { tokens = md.parseInline(view, {})[0]?.children || []; } catch (_) { return masked; }
	for (const token of tokens) {
		if (token.type !== 'link_open' && token.type !== 'image') continue;
		const destination = token.attrGet(token.type === 'image' ? 'src' : 'href');
		if (!destination) continue;
		// A link's image is a later token with an earlier destination. Collect ranges before
		// replacing them; token order is not source-destination order for nested labels.
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
				// Store restored source so nested escapes cannot leave mask tokens in the export.
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

// A span adds a bracket shell around already-authored Markdown. Keep balanced inner
// brackets (links, images and spans); escape only literal unmatched brackets that would
// otherwise close or strand that new shell. Code/escapes are already masked here.
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

function _rapierPandocDialectFindColorReplacements(paragraph) {
	const replacements = [];
	let cursor = 0, pendingStart = -1, pendingHex = '', pendingTextStart = -1;
	while (cursor < paragraph.length) {
		if (paragraph.startsWith(RAPIER_COLOR_CLOSE, cursor)) {
			const closeLen = RAPIER_COLOR_CLOSE.length;
			if (pendingStart !== -1) {
				replacements.push({
					start: pendingStart, end: cursor + closeLen,
					text: _rapierPandocDialectSpan(paragraph.slice(pendingTextStart, cursor), 'style="color: ' + pendingHex + ';"'),
				});
				pendingStart = -1;
			}
			cursor += closeLen;
			continue;
		}
		if (pendingStart === -1) {
			const match = _rapierMatchColorOpen(paragraph.slice(cursor, cursor + 40));
			if (match) {
				pendingStart = cursor;
				pendingTextStart = cursor + match.length;
				pendingHex = match.hex;
				cursor += match.length;
				continue;
			}
		}
		cursor++;
	}
	return replacements;
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
	const afterColor = _rapierPandocDialectApplyReplacements(masked, _rapierPandocDialectFindColorReplacements(masked));
	const afterMark = _rapierPandocDialectApplyReplacements(afterColor, _rapierPandocDialectFindMarkReplacements(afterColor));
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
	const text = String(source == null ? '' : source), opening = _rapierSplitOpeningFrontmatter(text);
	const body = opening.body, starts = [0];
	for (let at = 0; at < body.length; at++) {
		if (body[at] === '\r') { if (body[at + 1] === '\n') at++; starts.push(at + 1); }
		else if (body[at] === '\n') starts.push(at + 1);
	}
	// Maps come from the real block reader: indented code, nested fences and reference
	// definitions cannot be found reliably by testing a line for three backticks.
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
	return out + _rapierPandocDialectRewriteProse(body.slice(cursor));
}

return {exportText: _rapierPandocDialectExportText};
}
