// HTML to Markdown, tolerant, no DOM. Shared by every markup importer. Unknown elements stay literal with a warning; never delete their words.

import {reportCharacterChange} from './import-characters.mjs';
import {literalBlock, literalInline, literalDestination as encodeUrl} from './import.mjs';
import {markdownParser} from '../spec/md-assets.mjs';
import {formatColorOpen, COLOR_CLOSE} from '../spec/md-marks.mjs';
import {THEMATIC_BREAK, HARD_BREAK, cellBreaks, markRuns, highlightOfStyle, highlightRun, cellAlignment, alignmentDelimiter, codeLanguage, linkTitle, htmlBlockLines, listIsLoose} from '../spec/html-reading.mjs';
import {RAPIER_HIGHLIGHT_COLORS, safeCodeFence} from '../agent/markdown-spec.mjs';

// Words are escaped as every importer escapes them, and the extended marks' characters (= + ~ ^) as
// the paste door's Turndown writes them (spec/html-reading.mjs): escaped where they could make a mark.
const escapeInline = text => markRuns(literalInline(text));
// HTML collapses ASCII whitespace only. NBSP, narrow NBSP and Unicode separators are authored text.
const htmlSpace = text => text.replace(/[ \t\r\n\f]+/g, ' ');
const trimHtmlSpace = text => text.replace(/^[ \t\r\n\f]+|[ \t\r\n\f]+$/g, '');

const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const RAW_TEXT = new Set(['script', 'style']);
const BLOCK = new Set('p div h1 h2 h3 h4 h5 h6 ul ol blockquote pre hr table dl details'.split(' '));
const INLINE = new Set('b strong i em u ins s strike del a img code br mark sub sup'.split(' '));
const DL_PARTS = new Set(['dt', 'dd', 'summary']);

// Reuse the document parser's complete entity table. Decode only character references here:
// unescapeAll over an HTML text node would also erase literal Markdown backslashes.
function decodeEntities(s) {
	return String(s).replace(/&(?:#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g,
		entity => {
			if (entity[1] !== '#') return markdownParser().utils.unescapeAll(entity);
			const hex = /^&#x/i.test(entity), code = parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
			// Keep malformed character references literal, as before; never invent U+FFFD.
			return code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF) ? String.fromCodePoint(code) : entity;
		});
}

// ---- Tokenizer: a manual scan so a '>' inside a quoted attribute never ends the tag early. --------
function parseAttrs(raw) {
	const attrs = {};
	const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
	let m;
	while ((m = re.exec(raw))) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
	return attrs;
}
function tokenize(html) {
	const src = String(html == null ? '' : html), n = src.length, tokens = [];
	let i = 0;
	while (i < n) {
		const lt = src.indexOf('<', i);
		if (lt < 0) { tokens.push({t: 'text', v: src.slice(i)}); break; }
		if (lt > i) tokens.push({t: 'text', v: src.slice(i, lt)});
		if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
		if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt + 9); tokens.push({t: 'text', v: src.slice(lt + 9, e < 0 ? n : e)}); i = e < 0 ? n : e + 3; continue; }
		if (src[lt + 1] === '!' || src[lt + 1] === '?') { const e = src.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; } // doctype/PI
		let j = lt + 1, close = false;
		if (src[j] === '/') { close = true; j++; }
		const nameStart = j;
		while (j < n && /[a-zA-Z0-9:-]/.test(src[j])) j++;
		const name = src.slice(nameStart, j).toLowerCase();
		if (!name) { tokens.push({t: 'text', v: '<'}); i = lt + 1; continue; }
		let quote = '';
		while (j < n) {
			const c = src[j];
			if (quote) { if (c === quote) quote = ''; j++; continue; }
			if (c === '"' || c === "'") { quote = c; j++; continue; }
			if (c === '>') break;
			j++;
		}
		const attrsRaw = src.slice(nameStart + name.length, j);
		const selfClose = /\/\s*$/.test(attrsRaw) || VOID.has(name);
		i = j + 1;
		if (RAW_TEXT.has(name) && !close) { const idx = src.toLowerCase().indexOf('</' + name, i); i = idx < 0 ? n : (src.indexOf('>', idx) + 1 || n); tokens.push({t: 'literal', name, start: lt, end: i}); continue; }
		tokens.push(close ? {t: 'close', name, start: lt, end: i} : {t: 'open', name, attrs: parseAttrs(attrsRaw), self: selfClose, start: lt, end: i});
	}
	return tokens;
}
// A close tag pops everything opened after its match on the stack; one matching nothing is ignored.
function buildTree(tokens, source) {
	const root = {tag: '#root', attrs: {}, children: []};
	const stack = [root];
	for (const tok of tokens) {
		const top = stack[stack.length - 1];
		if (tok.t === 'text') { const v = decodeEntities(tok.v); if (v) top.children.push(v); continue; }
		if (tok.t === 'literal') { top.children.push({tag: tok.name, attrs: {}, children: [], raw: source.slice(tok.start, tok.end), literal: true, parent: top}); continue; }
		if (tok.t === 'open') { const node = {tag: tok.name, attrs: tok.attrs, children: [], start: tok.start, end: tok.end, raw: source.slice(tok.start, tok.end), parent: top}; top.children.push(node); if (!tok.self) stack.push(node); continue; }
		for (let k = stack.length - 1; k >= 1; k--) if (stack[k].tag === tok.name) { for (let j = k; j < stack.length; j++) { stack[j].end = tok.end; stack[j].raw = source.slice(stack[j].start, tok.end); } stack.length = k; break; }
	}
	for (const node of stack.slice(1)) node.raw = source.slice(node.start);
	return root;
}

// Keep writes marks as inline CSS. Read declarations, never a stylesheet or executable CSS:
// quoted semicolons, comments, functions and !important must not manufacture another property.
function styleDeclarations(source) {
	const out = new Map();
	let part = '', quote = '', depth = 0;
	const add = () => {
		const colon = part.indexOf(':'), name = part.slice(0, colon).trim().toLowerCase();
		if (colon > 0 && /^[-a-z]+$/.test(name)) {
			const raw = part.slice(colon + 1).trim(), important = /!\s*important\s*$/i.test(raw);
			const value = raw.replace(/!\s*important\s*$/i, '').trim().toLowerCase();
			if (value && (important || !out.get(name)?.important)) { out.delete(name); out.set(name, {value, important}); }
		} else if (part.trim()) out.set('style', {value: part.trim(), important: false});
		part = '';
	};
	for (let i = 0; i < source.length; i++) {
		const c = source[i];
		if (c === '\\') { part += c + (source[++i] || ''); continue; }
		if (quote) { part += c; if (c === quote) quote = ''; continue; }
		if (c === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); if (end < 0) break; part += ' '; i = end + 1; continue; }
		if (c === '"' || c === "'") { quote = c; part += c; continue; }
		if (c === '(') depth++;
		if (c === ')' && depth) depth--;
		if (c === ';' && !depth) add(); else part += c;
	}
	if (quote || depth) out.set('style', {value: part, important: false}); else add();
	return out;
}
const STYLE_TAGS = {b: 1, strong: 1, i: 2, em: 2, u: 4, ins: 4, s: 8, strike: 8, del: 8};
const STYLE_RUNS = [['strong', 1], ['em', 2], ['u', 4], ['s', 8]];
function styleMarks(styles) {
	let set = 0, clear = 0, decorationImportant = false;
	const unrepresented = [];
	for (const [name, {value, important}] of styles) {
		let bit = 0, on = false;
		if (name === 'font-weight' && /^(?:normal|bold|\d{1,4}(?:\.\d+)?)$/.test(value) && (!/^\d/.test(value) || +value >= 1 && +value <= 1000)) {
			bit = 1; on = value === 'bold' || +value >= 600;
			if (/^\d/.test(value) && value !== '400' && value !== '700') unrepresented.push(name);
		} else if (name === 'font-style' && /^(?:normal|italic|oblique)$/.test(value)) { bit = 2; on = value !== 'normal'; }
		else if ((name === 'text-decoration' || name === 'text-decoration-line') && /^(?:none|(?:underline|line-through)(?:\s+(?:underline|line-through))*)$/.test(value)) {
			if (!important && decorationImportant) continue;
			decorationImportant = important;
			const decoration = (value.includes('underline') ? 4 : 0) | (value.includes('line-through') ? 8 : 0);
			set = (set & ~12) | decoration; clear = (clear & ~12) | (12 ^ decoration); continue;
		} else {
			// Neutral export defaults have no mark to lose. Typography and layout are not Markdown;
			// name their properties in the same unsupported_html warnings as other importers.
			if (!(name === 'font-variant' && value === 'normal' || name === 'vertical-align' && value === 'baseline' || name === 'background-color' && value === 'transparent')) unrepresented.push(name);
			continue;
		}
		if (on) { set |= bit; clear &= ~bit; } else { clear |= bit; set &= ~bit; }
	}
	return {set, clear, unrepresented};
}

// Supported CSS joins the mark grammar before wrapping. **A****B** is not a safe spelling of **AB**.
function materializeStyles(tree) {
	const wrap = (children, mask) => {
		for (let i = STYLE_RUNS.length - 1; i >= 0; i--) { const [tag, bit] = STYLE_RUNS[i]; if (mask & bit) children = [{tag, attrs: {}, children, styleRun: true}]; }
		return children;
	};
	const walk = (node, inherited = 0, heading = false) => {
		if (typeof node === 'string') return wrap([node], inherited & (heading ? ~1 : -1));
		if (node.literal || node.tag === 'pre') return [node];
		heading ||= /^h[1-6]$/.test(node.tag);
		const semantic = STYLE_TAGS[node.tag] || (/^h[1-6]$/.test(node.tag) ? 1 : 0), marks = node.cssMarks || {set: 0, clear: 0};
		// Decoration propagates from ancestors even when a child says 'none'; a reset on
		// the element itself does replace that element's <u>/<s> default.
		const mask = (((inherited | semantic) & 3) & ~marks.clear) | (inherited & 12) | ((semantic & 12) & ~marks.clear) | marks.set;
		if (node.tag === 'code') return wrap([node], mask & (heading ? ~1 : -1));
		const children = (node.children || []).flatMap(child => walk(child, mask, heading));
		// A run with its own highlight stays a run (as a span: its marks are already in the children).
		if (highlightOf(node) && node.tag !== 'mark') { node.tag = 'span'; node.children = children; return [node]; }
		if (STYLE_TAGS[node.tag] || ((node.tag === 'span' || node.tag === 'font') && !textColorOf(node))) return children;
		node.children = children; return [node];
	};
	walk(tree);
	const join = node => {
		const children = [];
		for (const child of node.children || []) {
			const last = children.at(-1);
			if (child?.styleRun && last?.styleRun && child.tag === last.tag) last.children.push(...child.children);
			else children.push(child);
		}
		node.children = children;
		for (const child of children) if (typeof child !== 'string') { child.parent = node; join(child); }
		if (node.styleRun) node.raw = '<' + node.tag + '>' + children.map(child => typeof child === 'string' ? child.replace(/[!-/:-@[-`{-~]/g, c => '&#' + c.charCodeAt(0) + ';') : child.raw || '').join('') + '</' + node.tag + '>';
	};
	join(tree);
}

// A plain Takeout body's exact text is used only when the parsed tree proves no marks and the same lines (NBSP is space).
function plainProjection(node) {
	if (typeof node === 'string') return node;
	if (node.literal || node.cssMarks?.set || textColorOf(node) || highlightOf(node) || !['#root', 'p', 'div', 'span', 'font', 'br'].includes(node.tag)) return null;
	if (node.cssMarks?.unrepresented.some(name => /^(?:font-weight|font-style|text-decoration(?:-line)?|style)$/.test(name))) return null;
	if (node.tag === 'br') return '\n';
	if ((node.tag === 'p' || node.tag === 'div') && node.children?.length === 1 && node.children[0]?.tag === 'br') return '';
	const lines = []; let pending = '', present = false;
	for (const child of node.children || []) {
		const text = plainProjection(child);
		if (text === null) return null;
		if (typeof child !== 'string' && (child.tag === 'p' || child.tag === 'div')) {
			if (present) { lines.push(pending); pending = ''; present = false; }
			lines.push(text);
		} else { pending += text; present = true; }
	}
	if (present) lines.push(pending);
	return lines.join('\n');
}

// ---- Escaping (see the file header for the split) --------------------------------------------------
function protectStart(line) { // opener half of takeout.mjs's literalLine; no indent, HTML carries none
	const number = /^(\d{1,9})([.)])(?:\s|$)/.exec(line);
	if (number) return number[1] + '\\' + line.slice(number[1].length);
	if (/^(?:#{1,6}(?:\s|$)|>|[-+](?:\s|$)|(?:-{3,}|={3,})\s*$|\|)/.test(line)) return '\\' + line;
	return line;
}
function attrText(node, name) { return node.attrs && typeof node.attrs[name] === 'string' ? node.attrs[name] : null; }

// Text of a subtree, tags stripped, <br> kept as a newline -- code, so never re-walked for marks.
function textOf(node) {
	if (typeof node === 'string') return node;
	if (node.literal) return node.raw;
	if (node.tag === 'br') return '\n';
	if (node.tag === 'script' || node.tag === 'style') return '';
	return (node.children || []).map(textOf).join('');
}
function fence(text, min) { return '`'.repeat(Math.max(min, 1 + Math.max(0, ...(text.match(/`+/g) || []).map(s => s.length)))); }
function renderPre(node) {
	let text = textOf(node).replace(/\r\n?|\n/g, '\n');
	// HTML ignores exactly one initial LF directly inside <pre>, not inside its <code> child.
	if (typeof node.children?.[0] === 'string' && text.startsWith('\n')) text = text.slice(1);
	// The language and the fence are the paste door's (spec/html-reading.mjs, safeCodeFence).
	const code = (node.children || []).find(child => typeof child !== 'string' && child.tag === 'code');
	const language = code ? codeLanguage(attrText(code, 'class')) : '', f = safeCodeFence(text, '```', language);
	return f + language + '\n' + text + (text && !text.endsWith('\n') ? '\n' : '') + f;
}
function renderCode(node) {
	const text = textOf(node).replace(/\r\n|\r|\n/g, ' '), f = fence(text, 1);
	if (!text) return '<code></code>';
	const pad = text[0] === '`' || text.at(-1) === '`' || (text[0] === ' ' && text.at(-1) === ' ' && /[^ ]/.test(text)) ? ' ' : '';
	return f + pad + text + pad + f;
}
const MARK_OPEN = {'**': 'strong_open', '*': 'em_open', '++': 'ins_open', '~~': 's_open', '==': 'mark_open'};
// What a neighbour writes on the side facing a mark's delimiter, '' when it writes nothing there:
// its own text, a line break, a delimiter or bracket of its own (punctuation), a block's edge.
function edge(node, side) {
	if (typeof node === 'string') { const text = htmlSpace(node); return side < 0 ? text.slice(-1) : text.slice(0, 1); }
	if (node.literal || BLOCK.has(node.tag) || node.tag === 'li') return ' ';
	if (node.tag === 'br') return ' '; // a hard break writes spaces, then a new line
	if ((INLINE.has(node.tag) && !(node.tag === 'a' && !attrText(node, 'href'))) || textColorOf(node) || highlightOf(node)) return '.';
	const children = node.children || [];
	for (let i = side < 0 ? children.length - 1 : 0; i >= 0 && i < children.length; i += side < 0 ? -1 : 1) {
		const char = edge(children[i], side);
		if (char) return char;
	}
	return '';
}
// The character a delimiter will stand beside (as engine.js _rapierDelimiterNeighbour asks its DOM); line and block edges read as space; ASCII punctuation as '.'.
function neighbour(node, side) {
	let char = ' ';
	for (let at = node; at.parent; at = at.parent) {
		const siblings = at.parent.children;
		let found = '';
		for (let i = siblings.indexOf(at) + side; !found && i >= 0 && i < siblings.length; i += side) found = edge(siblings[i], side);
		if (found) { char = found; break; }
		const up = at.parent;
		if (up.tag === '#root' || BLOCK.has(up.tag) || up.tag === 'li' || up.tag === 'td' || up.tag === 'th' || DL_PARTS.has(up.tag)) break;
		if ((INLINE.has(up.tag) && !(up.tag === 'a' && !attrText(up, 'href'))) || textColorOf(up) || highlightOf(up)) { char = '.'; break; }
	}
	return /\s/.test(char) ? ' ' : /[!-/:-@[-`{-~]/.test(char) ? '.' : char;
}
function marked(text, mark, node) {
	const core = text.trim();
	if (!core) return text;
	// Different adjacent mark runs share one delimiter run in Markdown (for example,
	// **Alpha***!*). A per-mark flanking check cannot certify that combined run. Keep
	// their ordinary inline HTML instead; the text remains text, not literal delimiters.
	const siblings = node.parent?.children || [], at = siblings.indexOf(node);
	if (node.styleRun && [siblings[at - 1], siblings[at + 1]].some(sibling => sibling && typeof sibling !== 'string' && STYLE_TAGS[sibling.tag])) return node.raw;
	// Punctuation flanking can turn a<strong>!</strong>b into literal a**!**b: ask the inline owner with the real neighbours; keep HTML where the delimiters fail.
	const before = /^\s/.test(text) ? ' ' : neighbour(node, -1), after = /\s$/.test(text) ? ' ' : neighbour(node, 1);
	const tokens = markdownParser().parseInline(before + mark + core + mark + after, {})[0].children;
	const open = MARK_OPEN[mark];
	if (tokens[0]?.content !== before || tokens.at(-1)?.content !== after || !tokens.some(t => t.type === open) || !tokens.some(t => t.type === open.replace('_open', '_close'))) return node.raw;
	return text.slice(0, text.indexOf(core)) + mark + core + mark + text.slice(text.indexOf(core) + core.length);
}
// `~word~`/`^word^`: no internal whitespace or repeated delimiter (markdown-it-sub/-sup); otherwise keep the element.
function scripted(text, mark, node) {
	return new RegExp('^[^\\s' + (mark === '~' ? '~' : '\\^') + ']+$').test(text) ? mark + text + mark : node.raw;
}
function escapeHtmlText(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// Text colour via spec/md-marks.mjs; hex and rgb()/rgba() only; near-black and near-white stay plain.
function parseHexColor(value) {
	const source = String(value || '').trim().toLowerCase();
	let rgb, m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(source);
	if (m) {
		const hex = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
		rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
	} else {
		m = /^rgba?\(\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(source);
		if (!m) return null;
		if (m[4] != null && parseFloat(m[4]) < 0.5) return null;
		rgb = [m[1], m[2], m[3]].map(n => Math.max(0, Math.min(255, Math.round(parseFloat(n)))));
	}
	const lightness = (Math.max(...rgb) + Math.min(...rgb)) / 510;
	return lightness < 0.08 || lightness > 0.94 ? null : rgbToHex(rgb);
}
function rgbToHex(rgb) { return '#' + rgb.map(c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join(''); }
function textColorOf(node) {
	const style = attrText(node, 'style');
	const value = style ? (node.cssDeclarations ||= styleDeclarations(style)).get('color')?.value : null;
	return parseHexColor(value ?? (node.tag === 'font' ? attrText(node, 'color') : null));
}
// A run's own background is a highlight by the paste door's rule (spec/html-reading.mjs): the paste
// wraps the run's words in <mark> unless a mark is already around or inside it.
function highlightOf(node) {
	if (!node || typeof node === 'string' || node.literal) return '';
	const style = attrText(node, 'style');
	return style ? highlightOfStyle(style, node.tag) : '';
}
function holdsMark(node) { return (node.children || []).some(c => typeof c !== 'string' && (c.tag === 'mark' || holdsMark(c))); }
function insideMark(node) { for (let at = node.parent; at; at = at.parent) if (at.tag === 'mark') return true; return false; }
// The words' own edge spaces stand outside the fence, as Turndown moves them out of the element.
function highlighted(node, text, colour) {
	const core = text.trim();
	if (!core) return text;
	const visible = htmlSpace(textOf(node));
	const run = highlightRun(core, visible, colour, RAPIER_HIGHLIGHT_COLORS) ?? '<mark>' + core + '</mark>';
	return text.slice(0, text.indexOf(core)) + run + text.slice(text.indexOf(core) + core.length);
}

function renderInline(node) {
	if (node.literal) return renderLiteral(node);
	const tag = node.tag, light = STYLE_TAGS[tag] && !insideMark(node) && !holdsMark(node) ? highlightOf(node) : '';
	const inner = () => light ? highlighted(node, inlineText(node.children || []), light) : inlineText(node.children || []);
	if (tag === 'br') return HARD_BREAK + '\n';
	if (tag === 'code') return renderCode(node);
	if (tag === 'img') return '![' + escapeInline(attrText(node, 'alt') || '') + '](' + encodeUrl(attrText(node, 'src') || '') + linkTitle(attrText(node, 'title')) + ')';
	if (tag === 'b' || tag === 'strong') return marked(inner(), '**', node);
	if (tag === 'i' || tag === 'em') return marked(inner(), '*', node);
	if (tag === 'u' || tag === 'ins') return marked(inner(), '++', node); // Rapier's underline (docs/standard-adoption.md)
	if (tag === 's' || tag === 'strike' || tag === 'del') return marked(inner(), '~~', node);
	if (tag === 'mark') return holdsMark(node) ? inner() : highlighted(node, inner(), highlightOf(node)); // Bear's spelling, the paste door's fence
	if (tag === 'sub') return scripted(inner(), '~', node);
	if (tag === 'sup') return scripted(inner(), '^', node);
	if (tag === 'a') { const href = attrText(node, 'href'), s = inner(); return href ? '[' + (s || escapeInline(href)) + '](' + encodeUrl(href) + linkTitle(attrText(node, 'title')) + ')' : s; }
	return inner();
}
// Any other <span>/<font> is transparent.
function colored(node) {
	const hex = textColorOf(node), light = !insideMark(node) && !holdsMark(node) ? highlightOf(node) : '';
	if (!hex && !light) return null;
	const words = light ? highlighted(node, inlineText(node.children || []), light) : inlineText(node.children || []);
	return hex ? formatColorOpen(hex) + words + COLOR_CLOSE : words;
}
// A block tag met inline (malformed input) falls back to its own rendering; anything else is transparent.
function inlineText(children) {
	let out = '';
	const queue = (children || []).slice();
	while (queue.length) {
		const node = queue.shift();
		if (typeof node === 'string') { out += escapeInline(htmlSpace(node)); continue; }
		const tag = node.tag;
		if (node.literal) { out += renderLiteral(node); continue; }
		if (INLINE.has(tag)) { out += renderInline(node); continue; }
		if (tag === 'span' || tag === 'font') { const run = colored(node); if (run != null) { out += run; continue; } }
		if (BLOCK.has(tag) || tag === 'li') { const sub = blockWalk([node]); if (sub.length) out += (out && !/[\s\\]$/.test(out) ? ' ' : '') + sub.join(' '); continue; }
		queue.unshift(...(node.children || []));
	}
	return out;
}

// ---- Lists: CommonMark's marker width owns continuation indentation. Keep child blocks in order.
function checkbox(li) {
	if (li?.tag !== 'li') return null;
	const first = children => (children || []).find(c => typeof c !== 'string' || c.trim());
	const head = first(li.children), host = head?.tag === 'p' ? head : li;
	const input = first(host.children);
	return input?.tag === 'input' && (attrText(input, 'type') || '').toLowerCase() === 'checkbox' ? input : null;
}
function listItem(li, ordered, index) {
	const box = checkbox(li), kids = (li.children || []).filter(c => c !== box).map(c =>
		box && c === box.parent ? {...c, children: c.children.filter(k => k !== box)} : c);
	const marker = ordered ? index + '. ' : '- ', indent = ' '.repeat(marker.length);
	// Loose when an item holds more than one block, or the editor marked the list (spec/html-reading.mjs).
	// One paragraph per item is a word processor's tight list. A nested list under the words stays tight.
	const loose = looseItem(li);
	const content = (box ? '[' + ('checked' in box.attrs ? 'x' : ' ') + '] ' : '') + blockWalk(kids).reduce((out, block, i) =>
		!i ? block : out + (!loose && /^(?:[-+*]|\d{1,9}[.)])(?: |$)/.test(block) ? '\n' : '\n\n') + block, '');
	return marker + content.split('\n').map((line, i) => i && line ? indent + line : line).join('\n');
}
function markdownList(node) {
	const kids = (node.children || []).filter(child => typeof child !== 'string' || child.trim());
	if (kids.some(child => typeof child === 'string' || child.tag !== 'li')) return false;
	if (node.tag !== 'ol') return !kids.some(li => 'value' in li.attrs);
	const start = Number(attrText(node, 'start') ?? 1);
	// Markdown cannot express reversed/type-labelled lists, value jumps or ten-digit markers.
	return Number.isInteger(start) && start >= 0 && start + kids.length - 1 <= 999999999 &&
		!('reversed' in node.attrs) && !('type' in node.attrs) &&
		kids.every((li, i) => !('value' in li.attrs) || Number(li.attrs.value) === start + i);
}
function list(node, ordered) {
	if (!markdownList(node)) return renderLiteral(node);
	let n = ordered ? Number(attrText(node, 'start') ?? 1) : 1;
	const items = (node.children || []).filter(c => c && typeof c === 'object' && c.tag === 'li');
	return items.map((li, i) => listItem(li, ordered, n++) + (i < items.length - 1 ? (looseItem(li) ? '\n\n' : '\n') : '')).join('');
}
function looseItem(li) { return listIsLoose(li); }

// Rich cells and spans cannot be flattened without losing relationships; keep their source HTML.
function hasBlock(node) { for (const c of node.children || []) if (typeof c !== 'string' && (BLOCK.has(c.tag) || hasBlock(c))) return true; return false; }
function rowsOf(node, out) { for (const c of node.children || []) if (c && typeof c !== 'string') { if (c.tag === 'tr') out.push(c); else rowsOf(c, out); } }
function outsideCells(node) {
	if (node.tag === 'td' || node.tag === 'th') return false;
	return (node.children || []).some(child => typeof child === 'string' ? !!child.trim() : !['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'].includes(child.tag) || outsideCells(child));
}
// A cell of the first row of a table written as GFM: its alignment is the delimiter row's.
function headerCell(node) {
	if (node.tag !== 'th' && node.tag !== 'td') return false;
	let table = node.parent;
	while (table && table.tag !== 'table') table = table.parent;
	if (!table) return false;
	const rows = []; rowsOf(table, rows);
	return !!rows[0]?.children?.includes(node) && gfmTable(table) !== null;
}
// The table as GFM, or null when it is kept as HTML.
function gfmTable(node) {
	const rows = []; rowsOf(node, rows);
	const grid = rows.map(tr => (tr.children || []).filter(c => c && typeof c === 'object' && (c.tag === 'td' || c.tag === 'th')));
	if (!grid.length || !grid[0].length) return null;
	const cellWords = c => trimHtmlSpace(cellBreaks(inlineText(c.children || [])));
	const regular = !outsideCells(node) && grid.every(r => r.length === grid[0].length) && grid.every(r => r.every(c => !hasBlock(c) && !c.attrs.rowspan && !c.attrs.colspan));
	if (regular) {
		const line = r => '| ' + r.map(c => cellWords(c).replace(/\|/g, '\\|')).join(' | ') + ' |';
		const delimiter = grid[0].map(c => alignmentDelimiter(cellAlignment(attrText(c, 'style'), attrText(c, 'align'))));
		return [line(grid[0]), '| ' + delimiter.join(' | ') + ' |', ...grid.slice(1).map(line)].join('\n');
	}
	return null;
}
// Kept as HTML, the source's own markup is one HTML block (spec/html-reading.mjs).
function renderTable(node) { return gfmTable(node) ?? htmlBlockLines(node.raw); }

// ---- <dl> and <details>: Rapier's own conventions (docs/standard-adoption.md) ----
function renderDl(node) {
	const groups = []; let terms = [];
	for (const child of node.children || []) {
		if (typeof child === 'string') continue;
		if (child.tag === 'dt') { const term = trimHtmlSpace(inlineText(child.children || [])); if (term) terms.push(term); continue; }
		if (child.tag !== 'dd') continue;
		const body = trimHtmlSpace(blockWalk(child.children || []).join('\n\n'));
		const head = terms.length ? terms.join('\n') + '\n' : '';
		const definition = body.split('\n').map((line, i) => (i === 0 ? ': ' : '  ') + line).join('\n');
		groups.push(head + definition); terms = [];
	}
	if (terms.length) groups.push(terms.join('\n'));
	return groups.join('\n\n');
}
function renderDetails(node) {
	const summaryNode = (node.children || []).find(c => typeof c !== 'string' && c.tag === 'summary');
	const summaryText = escapeHtmlText(trimHtmlSpace(htmlSpace(summaryNode ? textOf(summaryNode) : 'details'))) || 'details';
	const body = trimHtmlSpace(blockWalk((node.children || []).filter(c => c !== summaryNode)).join('\n\n'));
	return '<details>\n<summary>' + summaryText + '</summary>\n\n' + (body ? body + '\n\n' : '') + '</details>';
}

// ---- Text and inline marks accumulate into the paragraph; a block tag flushes it first. -----------
function blockWalk(nodes) {
	const blocks = [];
	let para = [];
	const flush = () => {
		// A <br> with nothing on one side is dropped, never an orphan '\'.
		const text = trimHtmlSpace(para.join('').replace(/ *(?:  \n)/g, HARD_BREAK + '\n').replace(/^(?:  \n)+|(?:  \n)+$/g, ''));
		if (text) blocks.push(text.split('\n').map(protectStart).join('\n'));
		para = [];
	};
	const queue = (nodes || []).slice();
	while (queue.length) {
		const node = queue.shift();
		if (typeof node === 'string') { para.push(escapeInline(htmlSpace(node))); continue; }
		const tag = node.tag;
		if (node.literal) { flush(); blocks.push(renderLiteral(node)); continue; }
		if (tag === 'br') { para.push(HARD_BREAK + '\n'); continue; }
		if (tag === 'hr') { flush(); blocks.push(THEMATIC_BREAK); continue; }
		if (/^h[1-6]$/.test(tag)) { flush(); const s = trimHtmlSpace(inlineText(node.children)); if (s) blocks.push('#'.repeat(+tag[1]) + ' ' + s); continue; }
		if (tag === 'p' || tag === 'div') { flush(); blocks.push(...blockWalk(node.children || [])); continue; }
		if (tag === 'blockquote') { flush(); const inner = blockWalk(node.children || []).join('\n\n'); if (inner) blocks.push(inner.split('\n').map(l => '> ' + l).join('\n')); continue; }
		if (tag === 'pre') { flush(); blocks.push(renderPre(node)); continue; }
		if (tag === 'ul' || tag === 'ol') { flush(); const s = list(node, tag === 'ol'); if (s) blocks.push(s); continue; }
		if (tag === 'table') { flush(); const s = renderTable(node); if (s) blocks.push(s); continue; }
		if (tag === 'dl') { flush(); const s = renderDl(node); if (s) blocks.push(s); continue; }
		if (tag === 'details') { flush(); blocks.push(renderDetails(node)); continue; }
		if (tag === 'li') { flush(); blocks.push(listItem(node, false, 1)); continue; } // no <ul>/<ol> parent: still a bullet, tolerantly
		if (INLINE.has(tag)) { para.push(renderInline(node)); continue; }
		if (tag === 'span' || tag === 'font') { const run = colored(node); if (run != null) { para.push(run); continue; } }
		queue.unshift(...(node.children || [])); // unknown: transparent, its text (and marks) still walk
	}
	flush();
	return blocks;
}

const TRANSPARENT = new Set('html head body title span font section article main header footer aside figure figcaption en-note tbody thead tfoot tr td th caption colgroup col meta link'.split(' '));
function renderLiteral(node) { const f = fence(node.raw || '', 3); return f + 'html\n' + (node.raw || '') + '\n' + f; }
export function htmlToMarkdown(html, {warnings = [], plainText} = {}) {
	const source = String(html ?? ''), tree = buildTree(tokenize(source), source), styleWarnings = new Set();
	// Some callers convert several fragments of one note with the same warning array.
	// Count within that array, never across notes, and never swallow distinct style values.
	const literalWarnings = new Map(warnings.filter(row => row?.code === 'unsupported_html' && row.literal === true).map(row => [row.tag, row]));
	let hasStyles = false;
	const inspect = (node, inCode = false) => {
		if (typeof node === 'string') return;
		const known = node.tag === '#root' || BLOCK.has(node.tag) || INLINE.has(node.tag) || TRANSPARENT.has(node.tag) || node.tag === 'li' || DL_PARTS.has(node.tag) || (node.tag === 'input' && checkbox(node.parent?.tag === 'p' ? node.parent.parent : node.parent) === node);
		if (node.literal || !known) {
			node.literal = true;
			let row = literalWarnings.get(node.tag);
			if (!row) { row = {code: 'unsupported_html', tag: node.tag, literal: true, count: 0}; warnings.push(row); literalWarnings.set(node.tag, row); }
			row.count++;
			row.message = 'Unsupported HTML <' + node.tag + '> (' + row.count + (row.count === 1 ? ' occurrence' : ' occurrences') + ') was kept as literal source.';
			return;
		}
		const style = attrText(node, 'style');
		if (style) {
			const declarations = node.cssDeclarations ||= styleDeclarations(style);
			node.cssMarks = styleMarks(declarations);
			if (inCode || node.tag === 'pre') for (const name of declarations.keys()) if (/^(?:font-weight|font-style|text-decoration(?:-line)?)$/.test(name)) node.cssMarks.unrepresented.push(name);
			hasStyles ||= [...declarations.keys()].some(name => /^(?:font-weight|font-style|text-decoration(?:-line)?)$/.test(name));
			for (const property of node.cssMarks.unrepresented) {
				// Text colour already has an owner. Default black/white is deliberately unmarked.
				if (property === 'color' && ((node.tag === 'span' || node.tag === 'font') && textColorOf(node) || /^(?:#(?:000|000000|fff|ffffff)|black|white)$/i.test(declarations.get(property).value))) continue;
				if ((property === 'background-color' || property === 'background') && highlightOf(node)) continue;
				if (property === 'text-align' && headerCell(node)) continue; // written in the delimiter row
				const key = node.tag + ':' + property + ':' + declarations.get(property)?.value;
				if (!styleWarnings.has(key)) { styleWarnings.add(key); warnings.push({code: 'unsupported_html', tag: node.tag, property, value: declarations.get(property)?.value, message: 'The HTML style ' + property + ' was not applied. Its value stays in the original export and in this import record.'}); }
			}
		}
		if (node.tag === 'table' && gfmTable(node) === null) warnings.push({code: 'table_html', message: 'Rich table retained as HTML.'});
		if ((node.tag === 'ul' || node.tag === 'ol') && !markdownList(node)) warnings.push({code: 'unsupported_html', tag: node.tag, message: 'List structure or numbering not expressible in Markdown retained as literal HTML.'});
		for (const child of node.children || []) inspect(child, inCode || node.tag === 'pre' || node.tag === 'code');
	};
	inspect(tree);
	if (typeof plainText === 'string') {
		const projection = plainProjection(tree), comparable = value => value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trimEnd();
		if (projection !== null && comparable(projection) === comparable(plainText)) {
			const text = literalBlock(plainText);
			reportCharacterChange(plainText, text, warnings, 'HTML text'); return text;
		}
	}
	if (hasStyles) materializeStyles(tree);
	const text = blockWalk(tree.children).join('\n\n');
	reportCharacterChange(textOf(tree), text, warnings, 'HTML text');
	return text;
}
