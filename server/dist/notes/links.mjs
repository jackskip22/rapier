import {parseFrontMatter, aliasesOf} from './frontmatter.mjs';
// Notes links: a conservative scanner of exact byte spans, a rebuildable relationship index, the
// rename rewriter, unlinked mentions, and the [[ picker ranking. Pure: no DOM, no fs, no fetch.
//
// Why a scanner and not a parser: a note's own bytes are never Rapier-private. We AUTHOR only
// standard relative Markdown links; wikilink and embed and raw-HTML forms are parsed and
// preserved, never authored. A rewrite changes only a destination span -- CRLF, bare CR, BOM,
// trailing spaces, a missing final newline all survive. The module never writes a file: it returns
// planned patches; the shell applies them through the store queue with the editor's generation
// checks.
//
// Fences, indented/inline code and HTML comments are text, never links. A raw-HTML block keeps its
// Markdown-looking text literal, but its tags' URL attributes are links. Updating words scans that
// note; changing a filename or alias re-resolves the library with one pass over its name lookup,
// so an arrival can still shadow an earlier target.
import {noteFileName, noteTitle, projectCard} from './model.mjs';
import {markdownParser, escapeImageAlt} from '../spec/md-assets.mjs';
import {_rapierNextHeadingSlug} from '../editor/source-facts.mjs';

const ASSET_EXT = /\.(?:png|jpe?g|gif|webp|svg|jxl|bmp|ico|pdf|mp3|mp4|wav|m4a|ogg|webm|json|csv|zip|html?|txt|css|js)$/i;
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const PUNCT_SLUG = /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g;
const TYPE1 = /^(?:script|pre|style|textarea)$/i;

// How many leading characters the metadata block covers, read by the one module that owns it.
// A second reader here would drift; an indented `---` is a rule in the prose, not a fence.
export function frontMatterEnd(text) {
	const s = String(text ?? '');
	return s.length - parseFrontMatter(s).body.length;
}
// A picture's bytes are one line of two million characters, and every scan below walks lines:
// the engine's own search for the next line end, not a loop over each character.
const BASE64_RUN = /[A-Za-z0-9+/=]+/y, INDENTED_HEAD = /(?:^\uFEFF?|[\r\n])(?: {4}| {0,3}\t)/;
// The engine's own search for the next newline; a text with any bare or paired '\r' (known once per
// text) takes the slower class scan, so a picture's two-million-character line costs one memchr.
const LINE_END = /[\r\n]/g; let crText = null, crHas = false;
function lineEnd(s, i) {
	if (s !== crText) { crText = s; crHas = s.indexOf('\r') >= 0; }
	if (!crHas) { const n = s.indexOf('\n', i); return n < 0 ? s.length : n; }
	LINE_END.lastIndex = i; const m = LINE_END.exec(s); return m ? m.index : s.length;
}
function nextLine(s, e) { return e + (s[e] === '\r' && s[e + 1] === '\n' ? 2 : 1); }
export function isLineStart(s, i) { return i === 0 || s[i - 1] === '\n' || (s[i - 1] === '\r' && s[i] !== '\n') || (i === 1 && s[0] === '\uFEFF'); }
function fill(m, a, b, kind = 1) { if (b > a) m.fill(kind, a, b); }
function unescapeMd(s) { return s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, '$1'); }
function decodeDest(s) {
	try { return decodeURIComponent(String(s).replace(/%(?![0-9A-Fa-f]{2})/g, '%25')); }
	catch { return String(s); }
}
function normLabel(s) { return s.trim().replace(/[ \t\r\n]+/g, ' ').toLowerCase().toUpperCase(); }
function escaped(s, i) { let n = 0; while (i > 0 && s[--i] === '\\') n++; return n % 2 === 1; }

// Skip mask: nonzero where Markdown is text. 1 is protected code/comment/metadata, 2 is
// inline code/HTML allowed in a label, 3 is an HTML block (still a Markdown block boundary).
// Only the tag walk admits HTML links; fences and comments never gain that permission.
const blockMask = value => value === 1 || value === 3;
let maskedText = null, maskedFor = null, maskedHtml = null;
export function linkMask(text) {
	const s = String(text ?? '');
	// The projection asks for the same text's mask three times in a row (its own, the link scan's,
	// the heading scan's); the mask is never written after it is built, so the last one is handed back.
	if (s === maskedText) return maskedFor;
	const n = s.length, m = new Uint8Array(n);
	fill(m, 0, frontMatterEnd(s));
	skipFences(s, m);
	skipComments(s, m);
	skipHtmlBlocks(s, m);
	skipIndented(s, m);
	skipInlineCode(s, m);
	maskedHtml = skipHtmlTags(s, m);
	maskedText = s; maskedFor = m;
	return m;
}

// Reuse the admitted HTML walk: a tag spelled inside a fence or comment is document text.
export function hasHtmlTag(text, name) {
	linkMask(text);
	for (const tag of maskedHtml.values()) if (!tag.closing && tag.name === name) return true;
	return false;
}

const HTML_TAG_HEAD = /<\/?([A-Za-z][A-Za-z0-9-]*)(?=[\t\n\f\r />])/y;
const HTML_ATTR = /[^\t\n\f\r "'=<>/]+/y;
const HTML_SPACE = /[\t\n\f\r ]/;
function htmlTag(s, start) {
	HTML_TAG_HEAD.lastIndex = start;
	const head = HTML_TAG_HEAD.exec(s);
	if (!head) return null;
	const name = head[1].toLowerCase(), closing = s[start + 1] === '/', attrs = new Map();
	let p = HTML_TAG_HEAD.lastIndex;
	while (p < s.length) {
		const before = p;
		while (HTML_SPACE.test(s[p] || '')) p++;
		if (s[p] === '>' || s[p] === '/' && s[p + 1] === '>')
			return {start, end: p + (s[p] === '/' ? 2 : 1), name, closing, selfClosing: s[p] === '/', attrs};
		if (closing || p === before) return null;
		HTML_ATTR.lastIndex = p;
		const attribute = HTML_ATTR.exec(s);
		if (!attribute) return null;
		p = HTML_ATTR.lastIndex;
		const afterName = p;
		while (HTML_SPACE.test(s[p] || '')) p++;
		let value = null;
		if (s[p] === '=') {
			p++; while (HTML_SPACE.test(s[p] || '')) p++;
			const quote = s[p] === '"' || s[p] === "'" ? s[p++] : '';
			const begin = p;
			if (quote) { p = s.indexOf(quote, p); if (p < 0) return null; }
			else { while (p < s.length && !/[\t\n\f\r "'`=<>]/.test(s[p])) p++; if (p === begin) return null; }
			value = {start: begin, end: p};
			if (quote) p++;
		} else p = afterName;
		// HTML takes the first attribute, including an empty or boolean one, not a later duplicate.
		const key = attribute[0].toLowerCase();
		if (!attrs.has(key)) attrs.set(key, value);
	}
	return null;
}

function skipHtmlTags(s, m) {
	const tags = new Map();
	for (let i = s.indexOf('<'); i >= 0; i = s.indexOf('<', i + 1)) {
		if (m[i] && m[i] !== 3 || !m[i] && escaped(s, i)) continue;
		// A block's fill may have covered comment/fence marks. Comments are still opaque HTML;
		// backticks in that block, unlike comments, are just text around live HTML tags.
		if (s.startsWith('<!--', i)) {
			const end = s.indexOf('-->', i + 4);
			const next = end < 0 ? s.length : end + 3;
			fill(m, i, next); i = next - 1; continue;
		}
		const tag = htmlTag(s, i);
		if (!tag) continue;
		if (TYPE1.test(tag.name) && !tag.closing) {
			const close = new RegExp('</' + tag.name + '\\s*>', 'ig'); close.lastIndex = tag.end;
			const found = close.exec(s), end = found ? close.lastIndex : s.length;
			fill(m, i, end); i = end - 1; continue;
		}
		tags.set(i, tag);
		fill(m, i, tag.end, m[i] === 3 ? 3 : 2); i = tag.end - 1;
	}
	return tags;
}

// Four columns mean code only relative to the containing list item's content column.
// Keep the source coordinates; removing indentation to parse it would break exact-span edits.
function listContext(s, start, end, stack) {
	let head = start, indent = 0;
	while (head < end && (s[head] === ' ' || s[head] === '\t')) {
		indent += s[head++] === '\t' ? 4 - indent % 4 : 1;
	}
	if (head === end) return {head, indent, base: stack.at(-1) || 0};
	while (stack.length && indent < stack.at(-1)) stack.pop();
	const base = stack.at(-1) || 0;
	if (indent - base < 4 && /[-+*0-9]/.test(s[head] || '')) {
		const line = s.slice(head, end), marker = /^(?:[-+*]|[0-9]{1,9}[.)])([ \t]+|$)/.exec(line);
		if (marker && !/^(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,})$/.test(line)) {
			const width = marker[0].length - marker[1].length;
			let column = indent + width;
			for (const ch of marker[1]) column += ch === '\t' ? 4 - column % 4 : 1;
			const space = column - indent - width;
			stack.push(indent + width + (space > 0 && space < 5 ? space : 1));
		}
	}
	return {head, indent, base};
}

// Each scan first asks the engine whether its trigger is in the text at all: a note of a thousand
// lines and no fence, tag, indented line or definition costs one memchr, not a walk of every line.
function skipFences(s, m) {
	const lists = [];
	if (s.indexOf('```') < 0 && s.indexOf('~~~') < 0) return;
	let i = 0;
	if (s[0] === '\uFEFF') i = 1;
	while (i < s.length) {
		if (!isLineStart(s, i) || m[i]) { i = nextLine(s, lineEnd(s, i)); continue; }
		const context = listContext(s, i, lineEnd(s, i), lists);
		if (context.indent - context.base >= 4) { i = nextLine(s, lineEnd(s, i)); continue; }
		let j = context.head, container = context.base > 0;
		// Container fences are still code; their list/quote prefixes are not source to convert.
		for (;;) {
			const prefix = /^(?:> ?|(?:[-+*]|\d{1,9}[.)])[ \t]+)/.exec(s.slice(j, lineEnd(s, j)));
			if (!prefix) break;
			container = true; j += prefix[0].length;
			while (s[j] === ' ' || s[j] === '\t') j++;
		}
		const ch = s[j];
		if (ch !== '`' && ch !== '~') { i = nextLine(s, lineEnd(s, i)); continue; }
		let len = 0; while (s[j + len] === ch) len++;
		if (len < 3) { i = nextLine(s, lineEnd(s, i)); continue; }
		if (ch === '`' && s.slice(j + len, lineEnd(s, i)).includes('`')) { i = nextLine(s, lineEnd(s, i)); continue; }
		const endLine = lineEnd(s, i);
		let k = nextLine(s, endLine), closed = s.length;
		while (k < s.length) {
			const e = lineEnd(s, k);
			if (!m[k]) {
				let p = k, psp = 0;
				while (s[p] === ' ' && psp < (container ? Math.max(12, context.base + 3) : 3)) { p++; psp++; }
				if (container) while (s[p] === '>') { p++; while (s[p] === ' ' || s[p] === '\t') p++; }
				let cl = 0; while (s[p + cl] === ch) cl++;
				if (cl >= len && s.slice(p + cl, e).replace(/\r$/, '').trim() === '') { closed = e < s.length ? nextLine(s, e) : e; break; }
			}
			k = nextLine(s, e);
		}
		fill(m, i, closed);
		i = closed;
	}
}

function skipComments(s, m) {
	for (let i = s.indexOf('<!--'); i >= 0; i = s.indexOf('<!--', i + 1)) {
		if (m[i]) continue;
		const k = s.indexOf('-->', i + 4);
		const end = k < 0 ? s.length : k + 3;
		fill(m, i, end);
		i = end - 1;
	}
}

function skipHtmlBlocks(s, m) {
	if (s.indexOf('<') < 0) return;
	let i = 0;
	if (s[0] === '\uFEFF') i = 1;
	while (i < s.length) {
		if (!isLineStart(s, i) || m[i]) { i = nextLine(s, lineEnd(s, i)); continue; }
		const e = lineEnd(s, i);
		// Up to three spaces then '<' (a tab is four columns and fails), read at the line's head; the
		// whole line used to be sliced and tab-expanded for that, two copies of a picture's bytes.
		let j = i; while (s[j] === ' ' && j - i < 3) j++;
		if (s[j] !== '<') { i = nextLine(s, e); continue; }
		if (s.startsWith('<!--', j)) { i = nextLine(s, e); continue; } // comments already filled
		if (s[j + 1] === '?') {
			const k = s.indexOf('?>', j + 2);
			fill(m, i, k < 0 ? s.length : k + 2);
			i = k < 0 ? s.length : k + 2;
			continue;
		}
		if (s.startsWith('<![CDATA[', j)) {
			const k = s.indexOf(']]>', j + 9);
			fill(m, i, k < 0 ? s.length : k + 3);
			i = k < 0 ? s.length : k + 3;
			continue;
		}
		if (s[j + 1] === '!' && /[A-Za-z]/.test(s[j + 2] || '')) {
			const k = s.indexOf('>', j + 2);
			fill(m, i, k < 0 ? s.length : k + 1);
			i = k < 0 ? s.length : k + 1;
			continue;
		}
		const tag = /<\/?([A-Za-z][A-Za-z0-9-]*)/.exec(s.slice(j, j + 40));
		if (!tag || s[j + 1] === 'h' && SCHEME.test(s.slice(j + 1, e))) { i = nextLine(s, e); continue; }
		const name = tag[1];
		if (TYPE1.test(name) && s[j + 1] !== '/') {
			const re = new RegExp('</' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*>', 'i');
			const sub = s.slice(j);
			const mm = re.exec(sub);
			const end = mm ? j + mm.index + mm[0].length : s.length;
			fill(m, i, end);
			i = end;
			continue;
		}
		// Other raw HTML: until a blank line or EOF (CommonMark types 6 and 7, conservative).
		let k = nextLine(s, e);
		while (k < s.length) {
			const ee = lineEnd(s, k);
			if (isBlankLine(s, k, ee)) { k = nextLine(s, ee); break; }
			k = nextLine(s, ee);
		}
		fill(m, i, k, 3);
		i = k;
	}
}

function isBlankLine(s, i, e) {
	for (let p = i; p < e; p++) if (s[p] !== ' ' && s[p] !== '\t' && s[p] !== '\r') return false;
	return true;
}

function indentCols(s, i) {
	let cols = 0, p = i;
	while (p < s.length) {
		if (s[p] === ' ') cols++;
		else if (s[p] === '\t') cols += 4 - (cols % 4);
		else break;
		p++;
	}
	return cols;
}

function skipIndented(s, m) {
	const lists = [];
	// Four columns at a line head: four spaces, or up to three spaces and a tab (a tab reaches column
	// four however many spaces precede it; the CommonMark examples caught an earlier check that missed
	// that). One regex over the text says whether any line can be indented code at all.
	if (!INDENTED_HEAD.test(s)) return;
	let i = 0;
	if (s[0] === '\uFEFF') i = 1;
	while (i < s.length) {
		if (!isLineStart(s, i)) { i++; continue; }
		const e = lineEnd(s, i);
		if (m[i] || isBlankLine(s, i, e)) { i = nextLine(s, e); continue; }
		const context = listContext(s, i, e, lists);
		if (context.indent - context.base >= 4) {
			fill(m, i, e < s.length ? nextLine(s, e) : e);
		}
		i = nextLine(s, e);
	}
}

function skipInlineCode(s, m) {
	for (let i = s.indexOf('`'); i >= 0; i = s.indexOf('`', i + 1)) {
		if (m[i]) continue;
		let n = 1; while (s[i + n] === '`') n++;
		let j = i + n, found = false;
		while (j < s.length) {
			if (m[j]) { j++; continue; }
			if (s[j] === '`') {
				let k = 1; while (s[j + k] === '`') k++;
				if (k === n) { fill(m, i, j + k, 2); i = j + k - 1; found = true; break; }
				j += k;
				continue;
			}
			j++;
		}
		if (!found) i += n - 1;
	}
}

function parseBracket(s, i, mask, inline = true) {
	if (s[i] !== '[') return null;
	let j = i + 1, depth = 1;
	while (j < s.length && depth) {
		if (blockMask(mask[j])) return null;
		if (inline && mask[j] === 2) { while (j < s.length && mask[j] === 2) j++; continue; }
		if (s[j] === '\\' && j + 1 < s.length) { j += 2; continue; }
		if (s[j] === '[') depth++;
		else if (s[j] === ']') depth--;
		else if (s[j] === '\n' && (s[j + 1] === '\n' || (s[j + 1] === '\r' && s[j + 2] === '\n'))) return null;
		j++;
	}
	if (depth) return null;
	return {raw: s.slice(i + 1, j - 1), end: j};
}

// The parser owns entity meaning. Keep a raw-coordinate map for the first fragment marker so
// `\#` and `&#35;` are never partly swallowed by a destination-only rewrite. If the parser is
// unavailable, an entity-bearing link remains unresolved rather than choosing a literal name.
function destinationText(raw, html = false) {
	// Nothing to unescape and nothing to decode: the text is the raw (a picture's two million bytes of base64 have neither).
	if ((html || raw.indexOf('\\') < 0) && raw.indexOf('&') < 0) return {raw, hashAt: raw.indexOf('#'), unresolvedDecode: false};
	let decode = null, unresolvedDecode = false;
	if (/&(?:#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);/.test(raw)) {
		try { decode = markdownParser().utils.unescapeAll; } catch { unresolvedDecode = true; }
	}
	const tokens = html ? /&(?:#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);/g
		: /\\[!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~]|&(?:#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);/g;
	let text = '', pos = 0, hashAt = -1, m;
	while ((m = tokens.exec(raw))) {
		const plain = raw.slice(pos, m.index), value = m[0][0] === '\\' ? m[0].slice(1) : decode ? decode(m[0]) : m[0];
		if (hashAt < 0 && plain.includes('#')) hashAt = pos + plain.indexOf('#');
		text += plain;
		if (hashAt < 0 && value.includes('#')) hashAt = value === m[0] ? m.index + value.indexOf('#') : m.index;
		text += value; pos = m.index + m[0].length;
	}
	const tail = raw.slice(pos);
	if (hashAt < 0 && tail.includes('#')) hashAt = pos + tail.indexOf('#');
	return {raw: text + tail, hashAt, unresolvedDecode};
}

function parseDest(s, i, mask) {
	let p = i;
	while (s[p] === ' ' || s[p] === '\t') p++;
	if (s[p] === '\r') p++;
	if (s[p] === '\n') {
		p++;
		while (s[p] === ' ' || s[p] === '\t') p++;
	}
	if (blockMask(mask[p])) return null;
	if (s[p] === '<') {
		const start = p + 1;
		let j = start;
		while (j < s.length && s[j] !== '>' && s[j] !== '\n' && s[j] !== '\r' && s[j] !== '<') {
			if (s[j] === '\\' && j + 1 < s.length) j += 2; else j++;
		}
		if (s[j] !== '>') return null;
		return {...destinationText(s.slice(start, j)), destStart: start, destEnd: j, next: j + 1};
	}
	const start = p;
	let j = p, depth = 0;
	// A picture's own bytes are a destination two million characters long with nothing to parse in
	// them: past the header, the run of base64 is skipped by the engine's own search.
	if (s.startsWith('data:', j)) { const h = s.indexOf(';base64,', j); if (h > 0 && h - j < 128) { BASE64_RUN.lastIndex = h + 8; if (BASE64_RUN.test(s)) j = BASE64_RUN.lastIndex; } }
	while (j < s.length) {
		const c = s[j];
		if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || blockMask(mask[j])) break;
		if (c === '\\' && j + 1 < s.length) { j += 2; continue; }
		if (c === '(') depth++;
		else if (c === ')') { if (!depth) break; depth--; }
		j++;
	}
	if (j === start || depth) return null;
	return {...destinationText(s.slice(start, j)), destStart: start, destEnd: j, next: j};
}

function skipTitle(s, i, mask) {
	let p = i;
	while (s[p] === ' ' || s[p] === '\t') p++;
	if (s[p] === '\r') p++;
	if (s[p] === '\n') {
		p++;
		while (s[p] === ' ' || s[p] === '\t') p++;
	}
	const q = s[p];
	if (q !== '"' && q !== "'" && q !== '(') return i;
	const close = q === '(' ? ')' : q;
	let j = p + 1;
	while (j < s.length && s[j] !== close) {
		if (blockMask(mask[j]) || (close === ')' && s[j] === '(') || (s[j] === '\r' || s[j] === '\n') && /^(?:\r\n|\r|\n)[ \t]*(?:\r\n|\r|\n)/.test(s.slice(j))) return i;
		if (s[j] === '\\' && j + 1 < s.length) j += 2;
		else j++;
	}
	return s[j] === close ? j + 1 : i;
}

function titleRaw(s, i, end) {
	if (end <= i) return '';
	let p = i;
	while (/[ \t\r\n]/.test(s[p] || '') && p < end) p++;
	return s.slice(p + 1, end - 1);
}

function sourceDestEnd(s, dest) {
	return dest.hashAt < 0 ? dest.destEnd : dest.destStart + dest.hashAt;
}

function splitAnchor(raw) {
	const hash = raw.indexOf('#');
	if (hash < 0) return {dest: raw, anchor: ''};
	return {dest: raw.slice(0, hash), anchor: raw.slice(hash + 1)};
}

function linkObj(start, end, kind, text, dest, destStart, destEnd, anchor, alias, extra = {}) {
	return {start, end, kind, text, dest, destStart, destEnd, anchor: anchor || '', alias: alias || '', image: false, ...extra};
}

function parseWiki(s, i, mask) {
	const bang = s[i] === '!';
	const open = bang ? i + 1 : i;
	if (s[open] !== '[' || s[open + 1] !== '[') return null;
	if (mask[i] || mask[open] || mask[open + 1]) return null;
	let j = open + 2;
	while (j < s.length && !(s[j] === ']' && s[j + 1] === ']')) {
		if (mask[j] || s[j] === '\n' || s[j] === '\r') return null;
		j++;
	}
	if (s[j] !== ']' || s[j + 1] !== ']') return null;
	const innerStart = open + 2, inner = s.slice(innerStart, j);
	const pipe = inner.indexOf('|');
	const left = pipe >= 0 ? inner.slice(0, pipe) : inner;
	const alias = pipe >= 0 ? inner.slice(pipe + 1) : '';
	const hash = left.indexOf('#');
	const rawFile = hash >= 0 ? left.slice(0, hash) : left;
	const anchor = hash >= 0 ? left.slice(hash + 1) : '';
	const dest = rawFile.trim();
	const lead = rawFile.length - rawFile.trimStart().length;
	const destStart = innerStart + lead;
	const destEnd = destStart + dest.length;
	return linkObj(bang ? i : open, j + 2, bang ? 'embed' : 'wikilink', alias || dest, dest, destStart, destEnd, anchor, alias,
		{image: bang, rawAlt: alias || dest, altStart: pipe >= 0 ? innerStart + pipe + 1 : destStart, altEnd: pipe >= 0 ? j : destEnd, titleRaw: ''});
}

function parseAutolink(s, i, mask) {
	if (s[i] !== '<' || mask[i]) return null;
	const e = s.indexOf('>', i + 1);
	if (e < 0 || e - i > 2048) return null;
	const inner = s.slice(i + 1, e);
	if (/[\s<>]/.test(inner)) return null;
	if (!SCHEME.test(inner)) return null;
	return linkObj(i, e + 1, 'autolink', inner, inner, i + 1, e, '', '');
}

function collectDefs(s, mask) {
	const defs = new Map(); defs.ranges = [];
	if (s.indexOf('[') < 0) return defs;
	let i = s[0] === '\uFEFF' ? 1 : 0, boundary = true;
	while (i < s.length) {
		const advance = () => {
			const end = lineEnd(s, i), line = s.slice(i, end);
			boundary = !line.trim() || blockMask(mask[i]) || /^ {0,3}#{1,6}(?:[ \t]|$)/.test(line) || /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
			i = nextLine(s, end);
		};
		if (!isLineStart(s, i) || mask[i]) { advance(); continue; }
		let j = i, sp = 0;
		while (s[j] === ' ' && sp < 3) { j++; sp++; }
		if (s[j] !== '[' || !boundary) { advance(); continue; }
		const lab = parseBracket(s, j, mask, false);
		if (!lab || s[lab.end] !== ':') { advance(); continue; }
		const dest = parseDest(s, lab.end + 1, mask);
		if (!dest) { advance(); continue; }
		const afterTitle = skipTitle(s, dest.next, mask);
		let after = afterTitle, tail = after;
		while (s[tail] === ' ' || s[tail] === '\t') tail++;
		if (tail < s.length && s[tail] !== '\r' && s[tail] !== '\n') {
			// A failed title on the next line does not invalidate the preceding destination.
			if (lineEnd(s, dest.next) < afterTitle) { after = dest.next; tail = after; while (s[tail] === ' ' || s[tail] === '\t') tail++; }
			if (tail < s.length && s[tail] !== '\r' && s[tail] !== '\n') { advance(); continue; }
		}
		const key = normLabel(lab.raw);
		if (key) {
			defs.ranges.push({start: i, end: tail});
			if (!defs.has(key)) {
				const spA = dest.unresolvedDecode ? {dest: dest.raw, anchor: ''} : splitAnchor(dest.raw);
				defs.set(key, {dest: spA.dest, destStart: dest.destStart, destEnd: sourceDestEnd(s, dest), anchor: spA.anchor, start: i, end: after, label: unescapeMd(lab.raw), titleRaw: titleRaw(s, dest.next, after), unresolvedDecode: dest.unresolvedDecode});
			}
		}
		i = nextLine(s, lineEnd(s, after)); boundary = true;
	}
	return defs;
}

function parseMarkdownLink(s, i, mask, defs, checkNested = true) {
	const bang = i > 0 && s[i - 1] === '!' && !mask[i - 1] && !escaped(s, i - 1), start = bang ? i - 1 : i;
	const lab = parseBracket(s, i, mask);
	if (!lab) return null;
	const alt = {image: bang, rawAlt: lab.raw, altStart: i + 1, altEnd: lab.end - 1};
	if (!bang && checkNested) for (let j = i + 1; j < lab.end - 1; j++) {
		if (mask[j] || s[j] !== '[' || escaped(s, j)) continue;
		const child = parseMarkdownLink(s, j, mask, defs, false);
		if (child) { if (!child.image) return null; j = child.end - 1; }
	}

	if (s[lab.end] === '(') {
		const dest = parseDest(s, lab.end + 1, mask);
		if (!dest) return null;
		const afterTitle = skipTitle(s, dest.next, mask);
		let p = afterTitle;
		while (s[p] === ' ' || s[p] === '\t') p++;
		if (s[p] !== ')') return null;
		const spA = splitAnchor(dest.raw);
		return linkObj(start, p + 1, 'inline', unescapeMd(lab.raw), spA.dest, dest.destStart, sourceDestEnd(s, dest), spA.anchor, '',
			{...alt, titleRaw: titleRaw(s, dest.next, afterTitle), unresolvedDecode: dest.unresolvedDecode});
	}
	const ref = s[lab.end] === '[' ? parseBracket(s, lab.end, mask, false) : null;
	if (s[lab.end] === '[' && !ref || s[lab.end] === ':') return null;
	const key = normLabel(ref?.raw || lab.raw), def = defs.get(key);
	return def ? linkObj(start, ref ? ref.end : lab.end, 'reference', unescapeMd(lab.raw), def.dest, def.destStart, def.destEnd, def.anchor, '',
		{...alt, titleRaw: def.titleRaw, label: def.label, unresolvedDecode: def.unresolvedDecode, referenceKey: key, definition: {start: def.start, end: def.end}}) : null;
}

// Values are decoded for meaning, not for coordinates. No Markdown backslash escapes in HTML.
function htmlLink(s, tag, media) {
	if (['picture', 'audio', 'video'].includes(tag.name)) {
		if (tag.closing) { const at = media.lastIndexOf(tag.name); if (at >= 0) media.length = at; }
		else if (!tag.selfClosing) media.push(tag.name);
	}
	if (tag.closing || !HTML_LINK_TAGS.includes(tag.name)) return null;
	const attribute = tag.attrs.get(tag.name === 'a' ? 'href' : 'src');
	if (!attribute) return null;
	const raw = destinationText(s.slice(attribute.start, attribute.end), true);
	const parts = raw.unresolvedDecode ? {dest: raw.raw, anchor: ''} : splitAnchor(raw.raw);
	const alt = tag.attrs.get('alt');
	return linkObj(tag.start, tag.end, 'html', alt ? destinationText(s.slice(alt.start, alt.end), true).raw : '',
		parts.dest, attribute.start, raw.unresolvedDecode || raw.hashAt < 0 ? attribute.end : attribute.start + raw.hashAt, parts.anchor, '',
		{tag: tag.name, image: tag.name === 'img' || tag.name === 'source' && media.at(-1) === 'picture', unresolvedDecode: raw.unresolvedDecode});
}

// Recognition and destructive span admission are different questions. An unfinished link still
// keeps its file reachable. Removal needs a complete, unambiguous element, not just its open tag.
// Reuse the scanner's tokens (quoted attributes, comments and code are already opaque), once per
// source. Every token is pushed/popped at most once, including malformed deeply nested input.
let removalTags = null, removalEnds = null;
export function linkRemovalEnd(text, link) {
	if (link.kind !== 'html') return link.end;
	linkMask(String(text ?? ''));
	if (removalTags !== maskedHtml) {
		const ends = new Map(), stack = [], last = new Map();
		for (const tag of maskedHtml.values()) {
			if (!['a', 'audio', 'video'].includes(tag.name)) continue;
			const at = last.get(tag.name);
			if (!tag.closing) {
				if (at !== undefined) stack[at].ambiguous = true;
				last.set(tag.name, stack.length);
				stack.push({name: tag.name, start: tag.start, previous: at, ambiguous: at !== undefined || tag.selfClosing});
			} else if (at !== undefined) {
				const top = stack.length - 1;
				while (stack.length > at) {
					const index = stack.length - 1, open = stack.pop();
					if (index === at && index === top && !open.ambiguous) ends.set(open.start, tag.end);
					if (open.previous === undefined) last.delete(open.name); else last.set(open.name, open.previous);
				}
			}
		}
		removalTags = maskedHtml; removalEnds = ends;
	}
	const tag = maskedHtml.get(link.start);
	if (!tag || tag.closing || tag.name !== link.tag) return null;
	return ['a', 'audio', 'video'].includes(tag.name) ? removalEnds.get(tag.start) ?? null : tag.end;
}

export function scanLinks(text) {
	const s = String(text ?? ''), mask = linkMask(s), tags = maskedHtml, defs = collectDefs(s, mask), out = [], media = [];
	const usedDef = new Set(), definitionEnds = new Map(defs.ranges.map(row => [row.start, row.end]));
	let i = 0;
	if (s[0] === '\uFEFF') i = 1;
	while (i < s.length) {
		if (tags.has(i)) { const tag = tags.get(i), link = htmlLink(s, tag, media); if (link) out.push(link); i = tag.end; continue; }
		if (mask[i]) { i++; continue; }
		if (definitionEnds.has(i)) { i = definitionEnds.get(i); continue; }
		if (s[i] === '\\') { i += 2; continue; }
		if (s[i] === '<' ) {
			const a = parseAutolink(s, i, mask);
			if (a) { out.push(a); i = a.end; continue; }
		}
		if (s[i] === '!' && s[i + 1] === '[' && s[i + 2] === '[') {
			const w = parseWiki(s, i, mask);
			if (w) { out.push(w); i = w.end; continue; }
		}
		if (s[i] === '[' && s[i + 1] === '[') {
			const w = parseWiki(s, i, mask);
			if (w) { out.push(w); i = w.end; continue; }
		}
		if (s[i] === '[') {
			const link = parseMarkdownLink(s, i, mask, defs);
			if (link) {
				out.push(link); if (link.referenceKey) usedDef.add(link.referenceKey);
				// A linked picture is a real picture inside an outer link's label. Discover it
				// through this same parser, but do not recurse inside image alt text.
				if (!link.image) for (let j = link.altStart; j < link.altEnd; j++) {
					const tag = tags.get(j);
					if (tag && tag.end <= link.altEnd) { const child = htmlLink(s, tag, media); if (child) out.push(child); j = tag.end - 1; continue; }
					if (mask[j] || s[j] !== '!' || s[j + 1] !== '[' || escaped(s, j)) continue;
					const child = s[j + 2] === '[' ? parseWiki(s, j, mask) : parseMarkdownLink(s, j + 1, mask, defs);
					if (child?.image && child.end <= link.altEnd) { out.push(child); if (child.referenceKey) usedDef.add(child.referenceKey); j = child.end - 1; }
				}
				i = link.end; continue;
			}
		}
		i++;
	}
	for (const [key, def] of defs) {
		if (usedDef.has(key)) continue;
		out.push(linkObj(def.start, def.end, 'reference', def.label, def.dest, def.destStart, def.destEnd, def.anchor, '', {unresolvedDecode: def.unresolvedDecode}));
	}
	out.sort((a, b) => a.start - b.start || a.end - b.end);
	return out;
}

// The one place a link is AUTHORED: the picker's insertion and the shell's "link it" both write a
// standard relative Markdown link with a GitHub-style heading slug -- never a wikilink, which this
// module only parses and preserves. `linkDest` is the dest alone, for a caller that writes the
// link some other way (the editor's own anchor, which serialises to exactly this).
export function linkDest(file, anchor = '') {
	return String(file ?? '').split('/').map(part => encodeURIComponent(part).replace(/[()]/g, c => c === '(' ? '%28' : '%29')).join('/') + (anchor ? '#' + githubSlug(String(anchor)) : '');
}
export function markdownLink(text, file, anchor = '') {
	return '[' + escapeImageAlt(text) + '](' + linkDest(file, anchor) + ')';
}

export function headingAnchors(text) {
	const s = String(text ?? ''), mask = linkMask(s), seen = Object.create(null), out = [];
	let i = frontMatterEnd(s), prevStart = 0, prevText = '';
	if (i === 0 && s[0] === '\uFEFF') i = 1;
	const push = (slugSrc, display, level, start) => {
		const stripped = String(display).replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').trim();
		const slug = _rapierNextHeadingSlug(githubSlug(stripped), seen);
		out.push({slug, text: stripped, level, start});
	};
	while (i <= s.length) {
		if (i < s.length && !isLineStart(s, i)) { i++; continue; }
		const e = i >= s.length ? s.length : lineEnd(s, i);
		if (i < s.length && !mask[i]) {
			let j = i, sp = 0;
			while (s[j] === ' ' && sp < 3) { j++; sp++; }
			if (s[j] === '#') {
				let level = 0; while (s[j] === '#' && level < 6) { j++; level++; }
				if (level && (s[j] === ' ' || s[j] === '\t' || s[j] === '\r' || s[j] === '\n' || j === e)) {
					const raw = s.slice(j, e).replace(/\r$/, '').replace(/\s+#+\s*$/, '').trim();
					push(raw, raw, level, i);
					prevText = '';
					i = nextLine(s, e);
					continue;
				}
			}
			const setext = s.slice(j, e).replace(/\r$/, '');
			if (prevText && !mask[prevStart] && /^(?:=+|-+)\s*$/.test(setext)) {
				push(prevText, prevText, setext[0] === '=' ? 1 : 2, prevStart);
				prevText = '';
				i = nextLine(s, e);
				continue;
			}
			prevStart = i;
			prevText = isBlankLine(s, i, e) || indentCols(s, i) >= 4 ? '' : s.slice(i, e).replace(/\r$/, '').trim();
		} else prevText = '';
		i = nextLine(s, e);
	}
	return out;
}

function githubSlug(s) {
	return String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(PUNCT_SLUG, '').replace(/\s+/g, '-');
}

function joinPath(from, dest) {
	if (!dest) return {path: from};
	if (dest[0] === '/' || SCHEME.test(dest)) return {outside: true};
	const base = String(from || '').replace(/\\/g, '/').split('/');
	base.pop();
	const parts = String(dest).replace(/\\/g, '/').split('/');
	for (const part of parts) {
		if (!part || part === '.') continue;
		if (part === '..') {
			if (!base.length) return {outside: true};
			base.pop();
			continue;
		}
		base.push(part);
	}
	return {path: base.join('/')};
}

// Pictures and notes share path arithmetic; a container namespace belongs to the caller.
export function resolveAssetPath(from, dest) { return joinPath(from, decodeDest(dest || '')); }
export function normalizeSourcePath(name) { return joinPath('', String(name || '')); }

function unique(arr) {
	const out = [], seen = new Set();
	for (const x of arr) { if (x !== '' && x != null && !seen.has(x)) { seen.add(x); out.push(x); } }
	return out;
}

export function resolveLink(link, context = {}) { return resolveLinkWithNames(link, context); }

// A bulk resolve owns this lookup for one unchanged set of filenames and aliases. It is never
// retained across an arrival, removal or alias edit, where yesterday's unique target can be wrong.
function resolutionNames(files, aliases) {
	const folded = new Map(), named = new Map();
	for (const file of files) { const key = file.toLowerCase(), values = folded.get(key) || []; values.push(file); folded.set(key, values); }
	for (const [file, names] of aliases || []) if (files.has(file)) for (const key of new Set(names.map(name => name.normalize('NFC').toLowerCase()))) {
		const values = named.get(key) || []; values.push(file); named.set(key, values);
	}
	return {folded, named};
}

function resolveLinkWithNames(link, {from, files, sourceFiles = false, aliases} = {}, names = null) {
	if (!link) return {unresolved: 'missing'};
	if (link.unresolvedDecode) return {unresolved: 'entity_decoder_unavailable'};
	if (link.kind === 'autolink') return {unresolved: 'outside'};
	const dest = decodeDest(link.dest || '');
	if (SCHEME.test(dest) || dest.startsWith('/')) return {unresolved: 'outside'};
	if (!dest) {
		if (!from) return {unresolved: 'missing'};
		return {file: from, anchor: link.anchor || ''};
	}
	const joined = joinPath(from || '', dest);
	if (joined.outside) return {unresolved: 'outside'};
	const path = joined.path;
	const asset = ASSET_EXT.test(path) && !/\.md$/i.test(path);
	if (asset && !sourceFiles) return {unresolved: 'notNote'};
	const list = files instanceof Set ? files : new Set(files || []);
	const wiki = link.kind === 'wikilink' || link.kind === 'embed';
	// Obsidian folder paths start at the vault root; shortest names can be relative.
	// Explicit ./ and ../ keep their authored relative-file meaning.
	const vaultPath = () => {
		if (!wiki || !sourceFiles || /^(?:\.{1,2})(?:[\\/]|$)/.test(dest)) return null;
		const rootPath = normalizeSourcePath(dest).path;
		const names = unique([rootPath, /\.md$/i.test(rootPath) || asset ? rootPath : rootPath + '.md']);
		for (const name of names) if (list.has(name)) return {file: name, anchor: link.anchor || ''};
		const matches = [...list].filter(file => names.some(name => file.toLowerCase() === name.toLowerCase() || file.toLowerCase().endsWith('/' + name.toLowerCase())));
		return matches.length === 1 ? {file: matches[0], anchor: link.anchor || ''} : matches.length > 1 ? {unresolved: 'ambiguous'} : null;
	};
	if (/[\\/]/.test(dest)) { const target = vaultPath(); if (target) return target; }
	const want = wiki
		? unique([path, /\.md$/i.test(path) ? path : path + '.md'])
		: unique([path]);
	for (const w of want) if (list.has(w)) return {file: w, anchor: link.anchor || ''};
	const hits = [];
	if (names) {
		for (const w of want) for (const f of names.folded.get(w.toLowerCase()) || []) if (!hits.includes(f)) hits.push(f);
	} else for (const f of list) {
		for (const w of want) if (f.toLowerCase() === w.toLowerCase() && !hits.includes(f)) hits.push(f);
	}
	if (hits.length === 1) return {file: hits[0], anchor: link.anchor || ''};
	if (hits.length > 1) return {unresolved: 'ambiguous'};
	if (!/[\\/]/.test(dest)) { const target = vaultPath(); if (target) return target; }
	if (asset) return {unresolved: 'notNote'};
	// A bare wikilink may name a note by one of the names it declares for itself. A path or a
	// file name is a path, so only a plain name looks here, and only after real files have missed.
	if (wiki && !/[\\/]/.test(dest) && !/\.md$/i.test(dest)) {
		const name = dest.normalize('NFC').toLowerCase(), targets = names ? names.named.get(name) || [] : [];
		if (!names) for (const [file, aliasesOfFile] of aliases || []) if (list.has(file) && aliasesOfFile.some(alias => alias.normalize('NFC').toLowerCase() === name)) targets.push(file);
		if (targets.length === 1) return {file: targets[0], anchor: link.anchor || '', via: 'alias'};
		if (targets.length > 1) return {unresolved: 'ambiguous'};
	}
	return {unresolved: 'missing'};
}

function pushIn(inn, target, rec) {
	let arr = inn.get(target);
	if (!arr) { arr = []; inn.set(target, arr); }
	arr.push(rec);
}

// The index remembers where a link is and what it reaches, never a picture's bytes: a data URL's
// destination is kept to its header (a hundred notes with a picture each held a hundred pictures).
const DATA_DEST = 96;
function kept(L) { return L.dest && L.dest.length > DATA_DEST && /^data:/i.test(L.dest) ? {...L, dest: L.dest.slice(0, DATA_DEST)} : L; }
// The cache keeps byte-derived outgoing records and aliases, never folder-dependent resolution
// or backlinks. Optional-field presence matters (reference records can own an undefined decode
// flag), so a small mask preserves it without repeated property names or a shape adapter.
const LINK_KINDS = ['inline', 'reference', 'wikilink', 'embed', 'autolink', 'html'];
const LINK_FIELDS = ['start', 'end', 'kind', 'text', 'dest', 'destStart', 'destEnd', 'anchor', 'alias', 'image'];
const LINK_OPTIONAL = ['rawAlt', 'altStart', 'altEnd', 'titleRaw', 'unresolvedDecode', 'label', 'referenceKey', 'definition', 'tag'];
const HTML_LINK_TAGS = ['a', 'img', 'audio', 'video', 'source'];
export function packLinkProjection(projection, sourceBytes = Number.MAX_SAFE_INTEGER) {
	if (!projection || !Array.isArray(projection.out) || !Array.isArray(projection.aliases)) throw new TypeError('link projection needs out and aliases');
	const value = [projection.aliases.slice(), projection.out.map(link => {
		if (!link || Object.keys(link).some(k => k !== 'resolved' && !LINK_FIELDS.includes(k) && !LINK_OPTIONAL.includes(k))) throw new TypeError('unknown link field');
		const row = LINK_FIELDS.map(k => k === 'kind' ? LINK_KINDS.indexOf(link[k]) : link[k]);
		let mask = 0; const extra = [];
		for (const [i, k] of LINK_OPTIONAL.entries()) if (Object.hasOwn(link, k)) {
			if (k === 'unresolvedDecode' && link[k] !== undefined && typeof link[k] !== 'boolean' || k === 'definition' && (!link[k] || Object.keys(link[k]).some(key => key !== 'start' && key !== 'end'))) throw new TypeError('invalid optional link field');
			mask |= 1 << i;
			extra.push(k === 'definition' ? [link[k]?.start, link[k]?.end] : link[k] === undefined ? null : link[k]);
		}
		return [...row, mask, ...extra];
	})];
	if (!unpackLinkProjection(value, sourceBytes)) throw new TypeError('invalid link projection');
	return value;
}

export function unpackLinkProjection(value, sourceBytes = Number.MAX_SAFE_INTEGER) {
	const uint = n => Number.isSafeInteger(n) && n >= 0, offset = n => uint(n) && n <= sourceBytes;
	if (!uint(sourceBytes) || !Array.isArray(value) || value.length !== 2 || !value.every(Array.isArray)) return null;
	const [aliases, rows] = value, seen = new Set(), out = [];
	for (const alias of aliases) {
		if (typeof alias !== 'string' || !alias || alias.trim() !== alias) return null;
		const key = alias.normalize('NFC').toLowerCase();
		if (seen.has(key)) return null;
		seen.add(key);
	}
	let start = -1, end = -1;
	for (const row of rows) {
		if (!Array.isArray(row) || row.length < 11 || !uint(row[2]) || row[2] >= LINK_KINDS.length ||
			!uint(row[10]) || row[10] >= 1 << LINK_OPTIONAL.length) return null;
		const link = Object.fromEntries(LINK_FIELDS.map((k, i) => [k, k === 'kind' ? LINK_KINDS[row[i]] : row[i]]));
		if (![link.start, link.end, link.destStart, link.destEnd].every(offset) || link.start >= link.end || link.destStart > link.destEnd ||
			!['text', 'dest', 'anchor', 'alias'].every(k => typeof link[k] === 'string') || typeof link.image !== 'boolean' ||
			(/^data:/i.test(link.dest) && link.dest.length > DATA_DEST) || link.start < start || link.start === start && link.end <= end) return null;
		let at = 11;
		for (const [i, k] of LINK_OPTIONAL.entries()) if (row[10] & 1 << i) {
			const v = row[at++];
			if (k === 'definition') {
				if (!Array.isArray(v) || v.length !== 2 || !v.every(offset) || v[0] >= v[1]) return null;
				link[k] = {start: v[0], end: v[1]};
			} else if (k === 'unresolvedDecode') {
				if (v !== null && typeof v !== 'boolean') return null;
				link[k] = v === null ? undefined : v;
			} else {
				if (k === 'altStart' || k === 'altEnd' ? !offset(v) : k === 'tag' ? link.kind !== 'html' || !HTML_LINK_TAGS.includes(v) : typeof v !== 'string') return null;
				link[k] = v;
			}
		}
		if (at !== row.length || Object.hasOwn(link, 'altStart') !== Object.hasOwn(link, 'altEnd') ||
			link.altStart > link.altEnd || link.altStart < link.start || link.altEnd > link.end) return null;
		out.push(link); start = link.start; end = link.end;
	}
	return {out, aliases: aliases.slice()};
}

export function buildLinkIndex(texts) {
	const map = asMap(texts);
	const files = new Set(map.keys()), aliases = new Map([...map].map(([file, text]) => [file, aliasesOf(text)]));
	const out = new Map(), inn = new Map(), names = resolutionNames(files, aliases);
	for (const [file, text] of map) {
		const links = scanLinks(text);
		const resolved = links.map(L => {
			const r = resolveLinkWithNames(L, {from: file, files, aliases}, names);
			return {...kept(L), resolved: r};
		});
		out.set(file, resolved);
		for (const L of resolved) {
			if (L.resolved && L.resolved.file) pushIn(inn, L.resolved.file, {from: file, start: L.start, end: L.end});
		}
	}
	return {out, in: inn, files, aliases};
}

function installLinks(out, inn, from, links) {
	const targets = new Set((out.get(from) || []).map(L => L.resolved?.file).filter(Boolean));
	for (const target of targets) {
		const next = (inn.get(target) || []).filter(r => r.from !== from);
		if (next.length) inn.set(target, next); else inn.delete(target);
	}
	if (!links) out.delete(from); else out.set(from, links);
	// One concatenation per target, not one per link: a note whose thousands of links reach one note would be quadratic.
	const added = new Map();
	for (const L of links || []) if (L.resolved.file) { const rows = added.get(L.resolved.file); const row = {from, start: L.start, end: L.end}; if (rows) rows.push(row); else added.set(L.resolved.file, [row]); }
	for (const [target, rows] of added) inn.set(target, (inn.get(target) || []).concat(rows));
}

function resolvedLinks(links, from, files, aliases, names) {
	let changed = false;
	const next = links.map(L => {
		const resolved = resolveLinkWithNames(L, {from, files, aliases}, names), old = L.resolved;
		if (resolved.file === old.file && resolved.anchor === old.anchor && resolved.unresolved === old.unresolved && resolved.via === old.via) return L;
		changed = true; return {...L, resolved};
	});
	return changed ? next : null;
}

// `stream`: the folder is arriving one note at a time (#257's memory step) and the shell owns the
// only reference, so the index is grown in place and the re-resolve of every other note's links is
// left to one resolveLinkIndex pass at the end instead of one per arrival. Off it, the predecessor
// is untouched and shadowed aliases are re-resolved at once, as the model's witnesses hold.
export function updateLinkIndex(index, file, text, {stream = false, mapLink} = {}) {
	if (stream) linkRevisions.set(index, (linkRevisions.get(index) || 0) + 1);
	const projection = text == null ? null : projectLinks(text, {mapLink});
	return installLinkProjection(index, file, projection, stream);
}
export function projectLinks(text, {mapLink} = {}) {
	return {aliases: aliasesOf(text), out: scanLinks(text).map(L => mapLink ? mapLink(kept(L)) : kept(L))};
}

const linkRevisions = new WeakMap();
// The one whole-graph pass: every link resolved again against every name now known, privately and in bounded
// steps; one final pointer publishes the complete graph. A concurrent change restarts only this derived pass.
export function* stageLinkIndex(index) {
	const revision = linkRevisions.get(index) || 0;
	const check = () => { if ((linkRevisions.get(index) || 0) !== revision) throw new Error('link_index_changed'); };
	let work = 0;
	const files = new Set(), aliases = new Map(), out = new Map(), inn = new Map(), folded = new Map(), named = new Map();
	for (const name of index.files) { files.add(name); if (++work % 64 === 0) { yield; check(); } }
	for (const [name, values] of index.aliases) { aliases.set(name, values); if (++work % 64 === 0) { yield; check(); } }
	for (const name of files) { const key = name.toLowerCase(), values = folded.get(key) || []; values.push(name); folded.set(key, values); if (++work % 64 === 0) { yield; check(); } }
	for (const [name, values] of aliases) {
		const seen = new Set();
		if (files.has(name)) for (const value of values) {
			const key = value.normalize('NFC').toLowerCase();
			if (!seen.has(key)) { seen.add(key); const rows = named.get(key) || []; rows.push(name); named.set(key, rows); }
			if (++work % 64 === 0) { yield; check(); }
		}
		if (++work % 64 === 0) { yield; check(); }
	}
	for (const [from, links] of index.out) {
		const resolved = [];
		for (const link of links) {
			const next = resolveLinkWithNames(link, {from, files, aliases}, {folded, named});
			resolved.push({...link, resolved: next});
			if (next.file) pushIn(inn, next.file, {from, start: link.start, end: link.end});
			if (++work % 64 === 0) { yield; check(); }
		}
		out.set(from, resolved);
		if (++work % 64 === 0) { yield; check(); }
	}
	check(); return {out, in: inn, files, aliases};
}

// One note's own links, installed alone. Its rows are resolved in bounded steps against the names as they will
// stand with it installed, then put in over that note and its backlinks in one step (in place while the folder is
// streaming in, as updateLinkIndex's stream mode does; otherwise on a copy, the predecessor untouched). The other
// notes' links are not visited: when this note's names changed, the caller owes the one whole-graph pass above.
// Returns {index, changedNames}. A concurrent change restarts only this installation.
export function* stageLinkNote(index, {file, projection, stream = false} = {}) {
	const revision = linkRevisions.get(index) || 0;
	const check = () => { if ((linkRevisions.get(index) || 0) !== revision) throw new Error('link_index_changed'); };
	const names = projection ? projection.aliases : [], before = index.aliases.get(file) || [];
	const changedNames = projection === null || !index.files.has(file) || names.length !== before.length || names.some((name, i) => name !== before[i]);
	let rows = null;
	if (projection) {
		const files = new Set(index.files).add(file), aliases = new Map(index.aliases).set(file, names), lookup = resolutionNames(files, aliases);
		rows = [];
		for (const link of projection.out) {
			rows.push({...link, resolved: resolveLinkWithNames(link, {from: file, files, aliases}, lookup)});
			if (rows.length % 64 === 0) { yield; check(); }
		}
	}
	check();
	const out = stream ? index.out : new Map(index.out), inn = stream ? index.in : new Map(index.in), files = stream ? index.files : new Set(index.files), aliases = stream ? index.aliases : new Map(index.aliases);
	if (projection === null) { files.delete(file); aliases.delete(file); }
	else { files.add(file); aliases.set(file, names); }
	installLinks(out, inn, file, rows);
	if (stream) linkRevisions.set(index, revision + 1);
	return {index: stream ? index : {out, in: inn, files, aliases}, changedNames};
}

// Both cold projection and hydration enter the same installer and resolver. No cached resolution
// can survive a different folder: a new filename or alias may shadow yesterday's target.
function installLinkProjection(index, file, projection, stream) {
	const out = stream ? index.out : new Map(index.out), inn = stream ? index.in : new Map(index.in), files = stream ? index.files : new Set(index.files), aliases = stream ? index.aliases : new Map(index.aliases);
	const names = projection?.aliases || [], before = aliases.get(file) || [];
	const changedNames = projection == null || !files.has(file) || names.length !== before.length || names.some((name, i) => name !== before[i]);
	if (projection == null) { files.delete(file); aliases.delete(file); }
	else { files.add(file); aliases.set(file, names); }
	installLinks(out, inn, file, projection == null ? null : projection.out.map(L => ({...L, resolved: resolveLink(L, {from: file, files, aliases})})));
	const resolution = changedNames && !stream ? resolutionNames(files, aliases) : null;
	if (resolution) for (const [other, links] of out) {
		if (other === file) continue;
		const next = resolvedLinks(links, other, files, aliases, resolution);
		if (next) installLinks(out, inn, other, next);
	}
	return stream ? index : {out, in: inn, files, aliases};
}

// Pass the SAME admitted rows to both hydrations. Fresh/queued source wins over late cache rows;
// pending is the caller's shared unread/edit queue (Map or Set), not a second link queue. Stream
// mode owns the maps and leaves the final resolveLinkIndex pass to the existing folder owner.
export function hydrateLinkIndex(index, reuse, {stream = false, pending = new Set()} = {}) {
	if (stream) linkRevisions.set(index, (linkRevisions.get(index) || 0) + 1);
	const next = stream ? index : {out: new Map(index.out), in: new Map(index.in), files: new Set(index.files), aliases: new Map(index.aliases)};
	for (const {file, projection} of reuse) {
		if (next.out.has(file) || pending.has(file)) continue;
		installLinkProjection(next, file, projection.links, true);
	}
	return stream ? next : resolveLinkIndex(next);
}

// After a stream: every link resolved once more against every name now known, in place.
export function resolveLinkIndex(index) {
	linkRevisions.set(index, (linkRevisions.get(index) || 0) + 1);
	const {out, in: inn, files, aliases} = index, names = resolutionNames(files, aliases);
	for (const [from, links] of out) {
		const next = resolvedLinks(links, from, files, aliases, names);
		if (next) installLinks(out, inn, from, next);
	}
	return index;
}

function relativePath(from, to) {
	const a = String(from).replace(/\\/g, '/').split('/').slice(0, -1);
	const b = String(to).replace(/\\/g, '/').split('/');
	let i = 0;
	while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
	const up = a.length - i;
	return [...Array(up).fill('..'), ...b.slice(i)].join('/');
}

// Escape for all three HTML attribute forms; a quote in a filename cannot close its attribute.
export function escapeLinkAttribute(dest) {
	return String(dest).replace(/[&"'<>`=\t\n\f\r ]/g, c => c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&#' + c.charCodeAt(0) + ';');
}

function destForStyle(link, from, newFile) {
	const rel = relativePath(from, newFile);
	if (link.kind === 'wikilink' || link.kind === 'embed') {
		return /\.md$/i.test(link.dest) ? rel : rel.replace(/\.md$/i, '');
	}
	const dest = linkDest(rel);
	return link.kind === 'html' ? escapeLinkAttribute(dest) : dest;
}

export function renameLinks(index, texts, oldFile, newFile) {
	const map = asMap(texts);
	const patches = [];
	const collisions = [];
	for (const rec of index.in.get(newFile) || []) collisions.push({file: rec.from, start: rec.start, end: rec.end, why: 'already'});
	const who = new Set();
	for (const rec of index.in.get(oldFile) || []) who.add(rec.from);
	if (index.out.has(oldFile)) {
		for (const L of index.out.get(oldFile)) if (L.resolved && L.resolved.file === oldFile) who.add(oldFile);
	}
	for (const file of who) {
		const text = map.get(file);
		if (text == null) continue;
		const links = (index.out.get(file) || []).filter(L => L.resolved && L.resolved.file === oldFile && L.resolved.via !== 'alias');
		const spans = [], seen = new Set();
		for (const L of links) {
			if (!(L.destEnd > L.destStart)) continue;
			const k = L.destStart + ':' + L.destEnd;
			if (seen.has(k)) continue;
			seen.add(k);
			spans.push(L);
		}
		spans.sort((a, b) => b.destStart - a.destStart);
		let next = text;
		const changed = [];
		for (const L of spans) {
			const now = destForStyle(L, file, newFile);
			const was = next.slice(L.destStart, L.destEnd);
			if (was === now) continue;
			next = next.slice(0, L.destStart) + now + next.slice(L.destEnd);
			changed.push({start: L.destStart, end: L.destEnd, was, now});
		}
		if (changed.length) patches.push({file, text: next, changed});
	}
	patches.collisions = collisions;
	return patches;
}

// The complete map is fixed before any source changes. Resolve against source paths, then write
// destinations relative to the final files; resolving against partly renamed files loses links.
export function importLinkPatches(notes, fileMap) {
	const roots = new Map();
	for (const rec of fileMap || []) {
		const rootId = String(rec.rootId || '');
		if (!roots.has(rootId)) roots.set(rootId, {files: new Set(), paths: new Map(), aliases: new Map(), wikiAliases: new Map(), names: null});
		const root = roots.get(rootId), path = rec.sourceName || rec.sourcePath;
		root.files.add(path);
		const atPath = root.paths.get(path) || []; atPath.push(rec); root.paths.set(path, atPath);
		// A repeated alias on one record is one candidate; two records remain ambiguous.
		for (const alias of new Set(rec.sourceAliases || [])) {
			const atAlias = root.aliases.get(alias) || []; atAlias.push(rec); root.aliases.set(alias, atAlias);
		}
		for (const alias of new Set(rec.sourceWikiAliases || [])) {
			const atAlias = root.wikiAliases.get(alias) || []; atAlias.push(rec); root.wikiAliases.set(alias, atAlias);
		}
	}
	return (notes || []).map(note => {
		const text = String(note.text ?? ''), rootId = String(note.rootId || '');
		const from = String(note.sourceName || note.sourcePath || note.file);
		const root = roots.get(rootId) || {files: new Set(), paths: new Map(), aliases: new Map(), wikiAliases: new Map(), names: null};
		const files = root.files;
		const changed = [], unresolved = [], spans = new Map();
		for (const link of scanLinks(text)) {
			// A page titled with a URL names a wiki page, never a replacement for an external link.
			const aliasHits = [...new Set([...(root.aliases.get(link.dest) || []),
				...(['wikilink', 'embed'].includes(link.kind) ? root.wikiAliases.get(link.dest) || [] : [])])];
			const resolved = aliasHits.length ? (aliasHits.length === 1 ? {file: aliasHits[0].sourceName || aliasHits[0].sourcePath} : {unresolved: 'ambiguous'}) : resolveLinkWithNames(link, {from, files, sourceFiles: true}, root.names ||= resolutionNames(files));
			if (resolved.unresolved === 'outside') continue;
			if (resolved.unresolved === 'notNote') {
				if (!link.image) unresolved.push({dest: link.dest, anchor: link.anchor, reason: 'attachment', start: link.start, end: link.end});
				continue;
			}
			const targets = aliasHits.length ? aliasHits : resolved.file ? root.paths.get(resolved.file) || [] : [];
			if (resolved.unresolved || targets.length !== 1) {
				unresolved.push({dest: link.dest, anchor: link.anchor, reason: resolved.unresolved || 'ambiguous', start: link.start, end: link.end});
				continue;
			}
			if (!(link.destEnd > link.destStart)) continue; // a self-fragment stays a self-fragment
			const target = targets[0], now = destForStyle(link, note.file, target.file);
			// An already-correct relative link stays byte-exact, including its escaping.
			const current = resolveLink(link, {from: note.file, files: [target.file]});
			if (current.file === target.file && !aliasHits.length) continue;
			const was = text.slice(link.destStart, link.destEnd);
			if (now !== was) spans.set(link.destStart + ':' + link.destEnd, {start: link.destStart, end: link.destEnd, was, now});
		}
		let next = text;
		for (const edit of [...spans.values()].sort((a, b) => b.start - a.start)) {
			next = next.slice(0, edit.start) + edit.now + next.slice(edit.end);
			changed.push(edit);
		}
		return {file: note.file, rootId, sourceName: from, text: next, changed, unresolved};
	});
}

export function asMap(texts) { return texts instanceof Map ? texts : new Map(Object.entries(texts || {})); }
export function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function unlinkedMentions(index, texts, file, {titles, minLength = 4} = {}) {
	const map = asMap(texts);
	const own = map.get(file) || '';
	const names = (titles && titles.length ? titles : [noteFileName(own, []).replace(/\.md$/i, '')])
		.filter(t => t && t.length >= minLength);
	const hits = [];
	if (!names.length) return hits;
	for (const [other, src] of map) {
		if (other === file) continue;
		const mask = linkMask(src);
		const links = index.out.get(other) || [];
		const covered = (pos, len) => {
			if (mask[pos]) return true;
			for (let k = 0; k < len; k++) if (mask[pos + k]) return true;
			for (const L of links) if (pos < L.end && pos + len > L.start) return true;
			return false;
		};
		for (const title of names) {
			const re = new RegExp('(?<![\\p{L}\\p{N}_])' + escapeRe(title) + '(?![\\p{L}\\p{N}_])', 'gu');
			let m;
			while ((m = re.exec(src))) {
				if (covered(m.index, m[0].length)) continue;
				hits.push({file: other, start: m.index, end: m.index + m[0].length});
			}
		}
	}
	return hits;
}

// An inventory view can reuse cached names without building a graph just to open the picker.
export function pickerCandidates(index, texts, {current, recent = [], titles} = {}) {
	const map = asMap(texts);
	const candidates = [], cached = index?.aliases;
	for (const file of index?.files ?? map.keys()) {
		if (file === current) continue;
		const text = map.get(file) || '', names = cached?.get(file);
		// Keep the card's words, including its treatment of metadata, pictures and recordings.
		// A title the shell kept (#257: the words themselves may have been let go) or the card's own.
		const title = (titles?.get(file) ?? projectCard(file, text).title).replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim() || noteTitle(text) || file.replace(/\.md$/i, '');
		candidates.push({file, title, aliases: names ? names.slice() : aliasesOf(text)});
	}
	const files = new Set(candidates.map(c => c.file));
	return {candidates, recent: recent.filter(file => files.has(file))};
}

function titleOf(c) {
	if (c && typeof c === 'object') return c.title || String(c.file || '').replace(/\.md$/i, '');
	return String(c || '').replace(/\.md$/i, '');
}
function fileOf(c) { return c && typeof c === 'object' ? c.file : String(c); }
function isWordChar(c) { return /\p{L}|\p{N}|_/u.test(c); }

function fuzzyScore(query, title) {
	const q = query.normalize('NFC').toLowerCase(), t = title.normalize('NFC').toLowerCase();
	let qi = 0, score = 0, prev = -2;
	for (let i = 0; i < t.length && qi < q.length; i++) {
		if (t[i] !== q[qi]) continue;
		let bonus = 1;
		if (i === 0 || !isWordChar(t[i - 1])) bonus += 4;
		if (i === prev + 1) bonus += 1;
		score += bonus;
		prev = i;
		qi++;
	}
	return qi === q.length ? score : 0;
}

export function rankTargets(query, candidates, {recent = []} = {}) {
	const q = String(query ?? '').normalize('NFC');
	const recPos = new Map(recent.map((f, i) => [f, i]));
	const rows = [];
	for (const c of candidates || []) {
		const file = fileOf(c), title = titleOf(c);
		const aliases = c && typeof c === 'object' ? (typeof c.text === 'string' ? aliasesOf(c.text) : Array.isArray(c.aliases) ? c.aliases.filter(a => typeof a === 'string') : []) : [];
		const tl = title.normalize('NFC').toLowerCase(), ql = q.toLowerCase();
		let score = 0, why = 'fuzzy', alias = null;
		const folded = a => a.normalize('NFC').toLowerCase();
		if (q && tl === ql) { score = 4000; why = 'exact'; }
		else if (q && (alias = aliases.find(a => folded(a) === ql) ?? null) !== null) { score = 3500; why = 'alias'; }
		else if (q && tl.startsWith(ql)) { score = 3000 + Math.max(0, 200 - (tl.length - ql.length)); why = 'prefix'; }
		else if (q && (alias = aliases.find(a => folded(a).startsWith(ql)) ?? null) !== null) { score = 2500; why = 'alias-prefix'; }
		else if (recPos.has(file)) { score = 2000 - Math.min(199, recPos.get(file)); why = 'recent'; }
		else {
			let fz = q ? fuzzyScore(q, title) : 1;
			// The alias that found the note is the one that scored above its title.
			if (q) for (const name of aliases) { const scored = fuzzyScore(q, name); if (scored > fz) { fz = scored; alias = name; } }
			if (!fz) continue;
			// A long fuzzy match cannot overtake a named tier; the last recent score is 1,801.
			score = Math.min(1800, fz);
			why = 'fuzzy';
		}
		rows.push({file, score, why, alias, _rec: recPos.has(file) ? recPos.get(file) : 1e9, _name: file});
	}
	rows.sort((a, b) => b.score - a.score || a._rec - b._rec || (a._name < b._name ? -1 : a._name > b._name ? 1 : 0));
	// `alias`: the alias that matched, or null where the title did; the picker shows it under the title.
	return rows.map(({file, score, why, alias}) => ({file, score, why, alias}));
}
