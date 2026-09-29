// SPDX-License-Identifier: AGPL-3.0-only
// Code colouring, the CPU half. The GPU lexer the founder asked for (shell/vendor/gpu-lexer-0.0.1.js,
// docs/intent.md "A half-finished feature stays until the founder says it leaves") is the highlighter
// and highlight.js is gone; this reads source into the same nine token types the lexer emits --
// plain comment string number keyword type function constant operator -- as contiguous
// {start, end, type} spans covering the whole text, so code colours on every browser, offline, with
// nothing fetched, the moment a block renders. Where WebGPU exists the lexer repaints the same classes
// afterwards (editor/engine.js, _rapierColourCodeGpu). No language grammars: one set of heuristics
// for the fences people write, one shared word table. The fence's language name decides only two
// things -- a plain-text fence stays plain, a Markdown fence (and the Markdown source view) reads as
// Markdown. Deterministic, linear in the text, and it never throws on a string.

const _RAPIER_CODE_WORDS = new Set(('abstract alias alignas alignof and as assert associatedtype async auto await begin break ' +
	'callable cascade case catch chan class clone co_await co_return co_yield companion concept const const_cast consteval ' +
	'constexpr constinit constraint continue crate crossinline debugger declare decltype def default defer deinit del delegate ' +
	'delete distinct do done dyn dynamic_cast echo elif else elseif elsif end enddeclare endfor endforeach endif endswitch ' +
	'endwhile ensure enum esac except exists explicit export extends extension extern fallthrough fi fileprivate final finally ' +
	'fn for foreach foreign friend from fun func function global go goto guard having if impl implements implicit import in ' +
	'infix inline inner inout insert insteadof instanceof interface internal into is isset join keyof lambda lateinit let local ' +
	'loop match mod move mut mutable mutating namespace new noexcept noinline nonlocal not of operator or outer override ' +
	'package pass primary private protected protocol pub public raise readonly references reified reinterpret_cast repeat ' +
	'requires rescue restrict rethrows return satisfies sealed self Self signed sizeof some stackalloc static static_assert ' +
	'static_cast strictfp struct subscript super suspend switch synchronized tailrec template then this thread_local throw ' +
	'throws trait transient try typealias typedef typeid typename typeof undef union unique unless unsafe unset unsigned until ' +
	'use using val var vararg virtual void volatile when where while with xor yield exit').split(' '));
// Matched only in capitals, and only in a text that holds an SQL statement word in capitals: as
// lower-case words most of these are ordinary names, and a LIMIT elsewhere is a constant.
const _RAPIER_CODE_SQL_WORDS = new Set(('add all alter asc between by check column commit create cross database default ' +
	'delete desc drop each execute fetch first full grant group ilike index key language last left like limit natural next ' +
	'nulls offset on only order over partition procedure recursive replace returning returns revoke right rollback row rows ' +
	'schema select set table temp temporary top transaction trigger truncate update values view window').split(' '));
const _RAPIER_CODE_CONSTANTS = new Set('true false null nil None undefined True False NaN Infinity nullptr'.split(' '));
const _RAPIER_CODE_TYPES = new Set(('any bigint bool boolean byte char complex128 complex64 decimal double f32 f64 float float32 ' +
	'float64 i128 i16 i32 i64 i8 int int16 int32 int64 int8 isize long never nint nuint number rune sbyte short str string ' +
	'symbol u128 u16 u32 u64 u8 uint uint16 uint32 uint64 uint8 uintptr ulong unknown ushort usize').split(' '));
const _RAPIER_CODE_PLAIN = new Set('text txt plain plaintext nohighlight no-highlight'.split(' '));
const _RAPIER_CODE_STRING_PREFIXES = new Set('r b u f rb br fr rf u8 l n e x'.split(' '));
const _RAPIER_CODE_DEFINERS = new Set('def fn func fun function'.split(' '));
const _RAPIER_CODE_LABELLERS = new Set('break continue where dyn impl'.split(' '));
const _RAPIER_CODE_OPERATORS = new Set([...'+-*/%=<>!&|^~?:'].map(ch => ch.charCodeAt(0)));

// What is coloured at all: a text of at most 128 KB whose lines are at most 8192 characters (a
// longer line is data, not code anyone reads), and for a rendered block's own idle colouring, 32 KB.
const RAPIER_CODE_COLOUR_MAX_CHARS = 32 * 1024;
const _RAPIER_HIGHLIGHT_SLAB_MAX_CHARS = 128 * 1024;
const _RAPIER_HIGHLIGHT_LINE_MAX_CHARS = 8192;
function _rapierHighlightLinesAdmitted(text) {
	let lineStart = 0;
	for (let index = 0; index <= text.length; index++) {
		if (index - lineStart > _RAPIER_HIGHLIGHT_LINE_MAX_CHARS) return false;
		if (index === text.length || text.charCodeAt(index) === 10) lineStart = index + 1;
	}
	return true;
}
function _rapierHighlightAdmitted(value) {
	const text = String(value == null ? '' : value);
	if (text.length > _RAPIER_HIGHLIGHT_SLAB_MAX_CHARS) return false;
	return _rapierHighlightLinesAdmitted(text);
}

// Which reading a fence's language name asks for: 'plain' (no colour, as a plain-text fence always
// was), 'markdown', 'diff' (a patch is read by its lines), or 'code' for every other name and none.
function _rapierCodeReading(language) {
	const name = String(language ?? '').trim().toLowerCase();
	return _RAPIER_CODE_PLAIN.has(name) ? 'plain' : name === 'markdown' || name === 'md' ? 'markdown'
		: name === 'diff' || name === 'patch' ? 'diff' : 'code';
}

function tokenizeCode(source, language) {
	const text = typeof source === 'string' ? source : String(source ?? '');
	const reading = _rapierCodeReading(language);
	if (reading === 'plain') return text ? [{start: 0, end: text.length, type: 'plain'}] : [];
	return reading === 'markdown' ? _rapierMarkdownTokens(text, 0) : reading === 'diff' ? _rapierDiffTokens(text) : _rapierCodeSpans(text);
}

// The span list both readings build: gaps are plain, neighbours of one type merge, and positions
// only move forward, so the result is contiguous and covers the text by construction.
function _rapierCodeSpanList(text) {
	const spans = [];
	let covered = 0;
	const add = (start, end, type) => {
		const last = spans[spans.length - 1];
		if (last && last.type === type && last.end === start) last.end = end;
		else spans.push({start, end, type});
	};
	const colour = (start, end, type) => {
		if (start < covered || end <= start) return;
		if (start > covered) add(covered, start, 'plain');
		add(start, end, type);
		covered = end;
	};
	const finish = () => { if (covered < text.length) add(covered, text.length, 'plain'); return spans; };
	// The first index of `mark` at or after `from`, remembered so a text full of openers that never
	// close is still read in one pass.
	const seek = new Map();
	const next = (mark, from) => {
		const memo = seek.get(mark);
		if (memo && memo.from <= from && (memo.at < 0 || from <= memo.at)) return memo.at;
		const at = text.indexOf(mark, from);
		seek.set(mark, {from, at});
		return at;
	};
	const lineEnd = from => { const at = next('\n', from); return at < 0 ? text.length : at; };
	return {colour, finish, next, lineEnd};
}

function _rapierCodeWordChar(c) {
	return c >= 48 && c <= 57 || c >= 65 && c <= 90 || c >= 97 && c <= 122 || c === 95 || c >= 128;
}
// A space, a tab, a line end, or past the end of the text (NaN).
function _rapierCodeBreakChar(c) {
	return c === 32 || c === 9 || c === 10 || c === 13 || c !== c;
}

// Line comment marks as the text itself uses them at the start of its lines: a text whose comments
// are `#` and never `//` is a Python, shell, Ruby or YAML text, where `//` is division and `#word`
// is still a comment; `--` in mid-line is a comment only in a text that leads lines with `-- `.
function _rapierCodeCommentMarks(text) {
	let hash = false, slash = false, dash = false;
	for (let at = 0; at < text.length;) {
		let i = at;
		while (text.charCodeAt(i) === 32 || text.charCodeAt(i) === 9) i++;
		const c = text.charCodeAt(i), d = text.charCodeAt(i + 1);
		if (c === 35 && (d === 32 || d === 9 || d === 33 || d === 35 || d === 10 || d === 13 || i + 1 >= text.length)) hash = true;
		else if (c === 47 && d === 47) slash = true;
		else if (c === 45 && d === 45 && _rapierCodeBreakChar(text.charCodeAt(i + 2))) dash = true;
		const nl = text.indexOf('\n', i);
		if (nl < 0) break;
		at = nl + 1;
	}
	return {hashOnly: hash && !slash, dash};
}

function _rapierCodeSpans(text) {
	const n = text.length, {colour, finish, next, lineEnd} = _rapierCodeSpanList(text);
	const {hashOnly, dash} = _rapierCodeCommentMarks(text);
	const sql = /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(text);
	const code = i => text.charCodeAt(i);
	const lineStartsAt = i => { let k = i - 1; while (code(k) === 32 || code(k) === 9) k--; return k < 0 || code(k) === 10; };
	const significantBefore = i => { let k = i - 1; while (code(k) === 32 || code(k) === 9) k--; return k; };
	// Quoted text on one line: a backslash escapes the next character; unclosed, it ends with the line.
	const quoted = (from, quote) => {
		for (let i = from; i < n; i++) {
			const c = code(i);
			if (c === 92) i++;
			else if (c === quote) return i + 1;
			else if (c === 10) return i;
		}
		return n;
	};
	const closedBy = (from, mark, open) => { const at = next(mark, from); return at < 0 ? lineEnd(open) : at + mark.length; };
	let tickMissing = n + 1, wordText = '', wordEnd = -1, lifetimeEnd = -1, angle = null;
	for (let at = 0; at < n;) {
		const c = code(at), d = code(at + 1), before = code(at - 1);
		let end = at + 1, type = 'plain';
		if (c === 32 || c === 9 || c === 10 || c === 13) {
			while (end < n && (code(end) === 32 || code(end) === 9 || code(end) === 10 || code(end) === 13)) end++;
		} else if (angle && angle[0] === at) {
			end = angle[1]; type = 'string'; angle = null;
		} else if (c === 47 && d === 47 && !hashOnly && before !== 58) {
			end = lineEnd(at); type = 'comment';
		} else if (c === 47 && d === 42 && !hashOnly && !_rapierCodeWordChar(before) && before !== 42 && before !== 46) {
			end = closedBy(at + 2, '*/', at); type = 'comment';
		} else if (c === 60 && text.startsWith('<!--', at)) {
			end = closedBy(at + 4, '-->', at); type = 'comment';
		} else if (c === 35 && !_rapierCodeWordChar(before) && before !== 36 && before !== 38) {
			let hex = at + 1;
			while (hex < at + 10 && /[0-9a-f]/i.test(text[hex] || '')) hex++;
			if (hashOnly || _rapierCodeBreakChar(d) || d === 33 || d === 35) { end = lineEnd(at); type = 'comment'; }
			else if (hex - at >= 4 && hex - at <= 9 && !_rapierCodeWordChar(code(hex))) { end = hex; type = 'number'; }
			else if (lineStartsAt(at) && /[A-Za-z_]/.test(text[at + 1] || '')) {
				end = at + 2;
				while (end < n && _rapierCodeWordChar(code(end))) end++;
				type = 'keyword';
				let path = end;
				while (code(path) === 32 || code(path) === 9) path++;
				const shut = code(path) === 60 && /^#(?:include|import)$/.test(text.slice(at, end)) ? next('>', path) : -1;
				if (shut > path && shut < lineEnd(path)) angle = [path, shut + 1];
			}
		} else if (c === 59 && (_rapierCodeBreakChar(d) || d === 59) && lineStartsAt(at)) {
			end = lineEnd(at); type = 'comment';
		} else if (c === 45 && d === 45 && !_rapierCodeWordChar(before) && before !== 45 &&
				_rapierCodeBreakChar(code(at + 2)) && (dash || lineStartsAt(at))) {
			end = lineEnd(at); type = 'comment';
		} else if ((c === 34 || c === 39) && text.startsWith(c === 34 ? '"""' : "'''", at)) {
			end = closedBy(at + 3, c === 34 ? '"""' : "'''", at); type = 'string';
		} else if (c === 34) {
			end = quoted(at + 1, 34); type = 'string';
		} else if (c === 39) {
			if (!_rapierCodeWordChar(before)) {
				let run = at + 1;
				if (/[A-Za-z_]/.test(text[run] || '')) while (run < n && _rapierCodeWordChar(code(run))) run++;
				const prior = significantBefore(at), near = (from, span) => from >= 0 && at - from <= span ? text.slice(from, at) : null;
				// A Rust lifetime or loop label: 'a after & or <, a chain of them ('a, 'b and 'a: 'b),
				// 'static in a bound, after break/continue/where/dyn/impl, or a label at the head of a line.
				const chain = near(lifetimeEnd, 8), label = near(wordEnd, 8);
				// A quote with a name after it that never closes on its line is not a string in any of
				// these languages: it is a lifetime, a label or an apostrophe.
				const close = quoted(at + 1, 39), closed = close > at + 1 && code(close - 1) === 39;
				const lifetime = run > at + 1 && code(run) !== 39 && (!closed || before === 38 || before === 60 ||
					chain !== null && /^[ \t]*[,:+][ \t]*$/.test(chain) ||
					text.slice(at + 1, run) === 'static' && (code(prior) === 43 || code(prior) === 44 || code(prior) === 58) ||
					_RAPIER_CODE_LABELLERS.has(wordText) && label !== null && !label.trim() ||
					code(run) === 58 && lineStartsAt(at));
				if (lifetime) { end = run; type = 'type'; lifetimeEnd = run; }
				else { end = close; type = 'string'; }
			}
		} else if (c === 96) {
			type = 'string';
			end = lineEnd(at);
			if (at < tickMissing) {
				let i = at + 1;
				for (; i < n; i++) { const t = code(i); if (t === 92) i++; else if (t === 96) break; }
				if (i < n) end = i + 1;
				else tickMissing = at;
			}
		} else if (c >= 48 && c <= 57) {
			end = at + 1;
			if (c === 48 && /[xXbBoO]/.test(text[at + 1] || '')) end = at + 2;
			while (end < n && (code(end) >= 48 && code(end) <= 57 || code(end) === 95)) end++;
			if (code(end) === 46 && code(end + 1) >= 48 && code(end + 1) <= 57) {
				end += 2;
				while (end < n && (code(end) >= 48 && code(end) <= 57 || code(end) === 95)) end++;
			}
			if ((code(end) | 32) === 101) {
				const sign = code(end + 1) === 43 || code(end + 1) === 45 ? 1 : 0;
				if (code(end + 1 + sign) >= 48 && code(end + 1 + sign) <= 57) end += 1 + sign;
			}
			while (end < n && _rapierCodeWordChar(code(end))) end++;
			type = 'number';
		} else if (_rapierCodeWordChar(c)) {
			while (end < n && _rapierCodeWordChar(code(end))) end++;
			const word = text.slice(at, end), after = code(end);
			const member = before === 46 || before === 58 && code(at - 2) === 58 || before === 62 && code(at - 2) === 45;
			let blank = wordEnd >= 0;
			for (let k = wordEnd; blank && k < at; k++) blank = code(k) === 32 || code(k) === 9;
			if ((after === 34 || after === 39) && end - at <= 2 && _RAPIER_CODE_STRING_PREFIXES.has(word.toLowerCase())) {
				end = text.startsWith(after === 34 ? '"""' : "'''", end) ? closedBy(end + 3, after === 34 ? '"""' : "'''", at) : quoted(end + 1, after);
				type = 'string';
			} else if (blank && wordEnd < at && _RAPIER_CODE_DEFINERS.has(wordText)) type = 'function';
			else if (!member && _RAPIER_CODE_WORDS.has(word)) type = 'keyword';
			else if (_RAPIER_CODE_CONSTANTS.has(word)) type = 'constant';
			else if (_RAPIER_CODE_TYPES.has(word)) type = 'type';
			else if (/^[A-Z][A-Z0-9_]+$/.test(word)) {
				const lower = word.toLowerCase();
				type = !member && (_RAPIER_CODE_WORDS.has(lower) || sql && _RAPIER_CODE_SQL_WORDS.has(lower)) ? 'keyword' : after === 40 ? 'function' : 'constant';
			} else if (after === 40 || after === 33 && (code(end + 1) === 40 || code(end + 1) === 91 || code(end + 1) === 123)) {
				if (after === 33) end++;
				type = 'function';
			} else if (c >= 65 && c <= 90) type = before === 62 && code(at - 2) !== 45 && code(at - 2) !== 61 ? 'plain' : 'type';
			else if ((before === 60 || before === 47 && code(at - 2) === 60) && (_rapierCodeBreakChar(after) || after === 47 || after === 62)) type = 'keyword';
			else if (word.length > 2 && word.endsWith('_t')) type = 'type';
			if (type !== 'string') { wordText = word; wordEnd = end; }
		} else if (_RAPIER_CODE_OPERATORS.has(c)) type = 'operator';
		colour(at, end, type);
		at = end;
	}
	return finish();
}

// A patch, line by line: a file or hunk header and a removed line read as comments, an added line
// as a string -- the colours the Accent theme always gave them.
function _rapierDiffTokens(text) {
	const n = text.length, {colour, finish, lineEnd} = _rapierCodeSpanList(text);
	for (let at = 0; at < n;) {
		const end = lineEnd(at), c = text.charCodeAt(at);
		if (/^(?:diff |index |Index: |--- |\+\+\+ |@@|\*\*\*|===)/.test(text.slice(at, Math.min(end, at + 7))) || c === 45 || c === 60) colour(at, end, 'comment');
		else if (c === 43 || c === 62 || c === 33) colour(at, end, 'string');
		at = end + 1;
	}
	return finish();
}

// The Markdown source view and Markdown fences: headings, list markers, quotes, links, HTML comments
// and tags, front matter and fenced code (read as code, by its own language name). Emphasis has no
// class of its own among the nine and stays plain.
function _rapierMarkdownTokens(text, depth) {
	const n = text.length, {colour, finish, next, lineEnd} = _rapierCodeSpanList(text);
	const embed = (from, to, language) => {
		if (to <= from) return;
		const reading = _rapierCodeReading(language), body = text.slice(from, to);
		const spans = reading === 'code' ? _rapierCodeSpans(body) : reading === 'markdown' && depth < 1 ? _rapierMarkdownTokens(body, depth + 1) : [];
		for (const span of spans) colour(from + span.start, from + span.end, span.type);
	};
	// One line's inline text: code spans (plain, so nothing inside them reads as a link), links and
	// images, autolinks, tags and HTML comments. Returns where reading stopped (past the line when an
	// HTML comment runs on).
	const inline = (from, to) => {
		for (let i = from; i < to;) {
			const c = text.charCodeAt(i);
			if (c === 92) { i += 2; continue; }
			if (c === 96) {
				let k = i;
				while (k < to && text.charCodeAt(k) === 96) k++;
				const close = next(text.slice(i, k), k);
				i = close >= 0 && close < to ? close + (k - i) : k;
				continue;
			}
			if (c === 60) {
				if (text.startsWith('<!--', i)) {
					const close = next('-->', i + 4), end = close < 0 ? to : close + 3;
					colour(i, end, 'comment');
					if (end > to) return end;
					i = end;
					continue;
				}
				const close = next('>', i), tag = close >= 0 && close < to ? text.slice(i, close + 1) : '';
				if (/^<(?:https?|mailto|ftp):[^\s<>]*>$/i.test(tag)) { colour(i, close + 1, 'string'); i = close + 1; continue; }
				if (/^<\/?[A-Za-z][\w-]*(?:\s[^<>]*)?\/?>$/.test(tag)) { embed(i, close + 1, ''); i = close + 1; continue; }
			}
			if (c === 91 || c === 33 && text.charCodeAt(i + 1) === 91) {
				const shut = next(']', i), after = text.charCodeAt(shut + 1);
				if (shut >= 0 && shut < to && (after === 40 || after === 91)) {
					const end = next(after === 40 ? ')' : ']', shut + 2);
					if (end >= 0 && end < to) { colour(i, end + 1, 'string'); i = end + 1; continue; }
				}
			}
			i++;
		}
		return to;
	};
	// A byte-order mark is not the first character of the first line's Markdown.
	const bom = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
	let at = bom, fence = null, heading = false, midLine = false;
	const front = /^---[ \t]*\r?\n/.exec(text.slice(bom, bom + 8));
	if (front && depth === 0) {
		const shut = /\n(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/g;
		shut.lastIndex = bom + front[0].length - 1;
		const found = shut.exec(text);
		if (found) {
			colour(bom, bom + front[0].length - 1, 'comment');
			embed(bom + front[0].length, found.index + 1, 'yaml');
			colour(found.index + 1, found.index + found[0].length, 'comment');
			at = found.index + found[0].length;
		}
	}
	while (at < n) {
		const end = lineEnd(at), after = Math.min(n, end + 1);
		if (midLine) {
			// The rest of a line an HTML comment from an earlier line ended on: inline text only.
			const stop = inline(at, end);
			midLine = stop > end;
			at = midLine ? stop : after;
			continue;
		}
		const line = text.slice(at, end);
		if (fence) {
			const shut = /^ {0,3}(`+|~+)[ \t]*\r?$/.exec(line);
			if (shut && shut[1][0] === fence.mark && shut[1].length >= fence.size) {
				embed(fence.body, at, fence.info);
				colour(at, end, 'comment');
				fence = null;
			}
			at = after;
			continue;
		}
		const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
			fence = {mark: open[1][0], size: open[1].length, info: open[2].trim().split(/\s+/)[0], body: after};
			colour(at, end, 'comment');
			at = after;
			continue;
		}
		let stop = end;
		if (heading || /^ {0,3}#{1,6}(?:[ \t]|\r?$)/.test(line)) { colour(at, end, 'type'); heading = false; }
		else if (/^ {0,3}>/.test(line)) colour(at, end, 'comment');
		else if (/^ {0,3}\[(?!\^)[^\]]+\]:/.test(line)) colour(at, end, 'string');
		else if (!/^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}\r?$/.test(line)) {
			const marker = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?=[ \t]|\r?$)/.exec(line);
			const nextLine = text.slice(after, lineEnd(after));
			if (!marker && line.trim() && /^ {0,3}(?:=+|-{2,})[ \t]*\r?$/.test(nextLine)) { colour(at, end, 'type'); heading = true; }
			else {
				if (marker) colour(at, at + marker[0].length, 'number');
				stop = inline(marker ? at + marker[0].length : at, end);
			}
		}
		midLine = stop > end;
		at = midLine ? stop : after;
	}
	if (fence) embed(fence.body, n, fence.info);
	return finish();
}

// The one projection of token spans to markup, for the tokenizer's spans and the GPU lexer's alike:
// escaped text, a `tok-<type>` span around every token that is not plain. A span list that is out of
// order or does not cover the source is refused (the lexer's result is checked, never trusted).
function _rapierTokensHtml(source, spans) {
	let html = '', at = 0;
	for (const span of spans) {
		if (!span || span.start !== at || !(span.end >= span.start) || span.end > source.length) throw new Error('code token order');
		const text = source.slice(span.start, span.end).replace(/[&<>]/g, ch => ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;');
		html += /^(?:comment|string|number|keyword|type|function|constant|operator)$/.test(span.type) ? '<span class="tok-' + span.type + '">' + text + '</span>' : text;
		at = span.end;
	}
	if (at !== source.length) throw new Error('code token coverage');
	return html;
}

function _rapierCodeHtml(source, language) {
	const text = typeof source === 'string' ? source : String(source ?? '');
	return _rapierTokensHtml(text, tokenizeCode(text, language));
}

export { RAPIER_CODE_COLOUR_MAX_CHARS, _RAPIER_HIGHLIGHT_SLAB_MAX_CHARS, _RAPIER_HIGHLIGHT_LINE_MAX_CHARS,
	_rapierHighlightLinesAdmitted, _rapierHighlightAdmitted, _RAPIER_CODE_WORDS, _RAPIER_CODE_SQL_WORDS, _RAPIER_CODE_CONSTANTS, _RAPIER_CODE_TYPES, _RAPIER_CODE_PLAIN, _RAPIER_CODE_STRING_PREFIXES,
	_RAPIER_CODE_DEFINERS, _RAPIER_CODE_LABELLERS, _RAPIER_CODE_OPERATORS,
	_rapierCodeReading, tokenizeCode, _rapierCodeSpanList, _rapierCodeWordChar, _rapierCodeBreakChar, _rapierCodeCommentMarks, _rapierCodeSpans,
	_rapierDiffTokens, _rapierMarkdownTokens, _rapierTokensHtml, _rapierCodeHtml };
