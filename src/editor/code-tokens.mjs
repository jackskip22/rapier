// SPDX-License-Identifier: AGPL-3.0-only

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
const _RAPIER_CODE_CLASS = [[1, _RAPIER_CODE_WORDS], [2, _RAPIER_CODE_CONSTANTS], [4, _RAPIER_CODE_TYPES]].reduce((table, [bit, words]) => {
	for (const word of words) table.set(word, (table.get(word) || 0) | bit);
	return table;
}, new Map());
const _RAPIER_CODE_CLASS_WORDS = [..._RAPIER_CODE_CLASS.keys()];
const _RAPIER_CODE_CLASS_BITS = Uint8Array.from(_RAPIER_CODE_CLASS_WORDS, word => _RAPIER_CODE_CLASS.get(word));
const _RAPIER_CODE_CLASS_SLOTS = _RAPIER_CODE_CLASS_WORDS.reduce((slots, word, index) => {
	let slot = _rapierCodeWordHash(word, 0, word.length) & 1023;
	while (slots[slot]) slot = slot + 1 & 1023;
	slots[slot] = index + 1;
	return slots;
}, new Uint16Array(1024));
function _rapierCodeWordHash(text, start, end) {
	let hash = 0;
	for (let i = start; i < end; i++) hash = Math.imul(hash, 31) + text.charCodeAt(i) | 0;
	return hash;
}
const _RAPIER_CODE_CLASS_LENGTHS = _RAPIER_CODE_CLASS_WORDS.reduce((lengths, word) => {
	lengths[word.charCodeAt(0)] |= 1 << word.length;
	return lengths;
}, new Uint32Array(128));
function _rapierCodeWordClass(text, start, end) {
	const c = text.charCodeAt(start), length = end - start;
	if (c >= 128 || length > 31 || !(_RAPIER_CODE_CLASS_LENGTHS[c] >>> length & 1)) return 0;
	for (let slot = _rapierCodeWordHash(text, start, end) & 1023, entry; (entry = _RAPIER_CODE_CLASS_SLOTS[slot]) !== 0; slot = slot + 1 & 1023) {
		const word = _RAPIER_CODE_CLASS_WORDS[entry - 1];
		if (word.length === length && text.startsWith(word, start)) return _RAPIER_CODE_CLASS_BITS[entry - 1];
	}
	return 0;
}
const _RAPIER_CODE_OPERATOR_TABLE = Uint8Array.from({length: 128}, (_, c) => _RAPIER_CODE_OPERATORS.has(c) ? 1 : 0);
const _RAPIER_CODE_PLAIN_TABLE = Uint8Array.from({length: 128}, (_, c) => !_rapierCodeWordChar(c) && !_RAPIER_CODE_OPERATORS.has(c) && !'/<#;-"\'`'.includes(String.fromCharCode(c)) ? 1 : 0);

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

function _rapierCodeReading(language) {
	const name = String(language ?? '').trim().toLowerCase();
	return _RAPIER_CODE_PLAIN.has(name) ? 'plain' : name === 'markdown' || name === 'md' ? 'markdown'
		: name === 'diff' || name === 'patch' ? 'diff' : 'code';
}

function tokenizeCode(source, language) {
	return _rapierRunSpans(_rapierCodeRuns(typeof source === 'string' ? source : String(source ?? ''), language));
}

const _RAPIER_TOKEN_TYPES = Object.freeze(['plain', 'comment', 'string', 'number', 'keyword', 'type', 'function', 'constant', 'operator']);
const _RAPIER_TOKEN_KIND = Object.freeze(Object.assign(Object.create(null), Object.fromEntries(_RAPIER_TOKEN_TYPES.map((type, kind) => [type, kind]))));
function _rapierCodeRuns(text, language) {
	const reading = _rapierCodeReading(language);
	if (reading === 'plain') return text ? {ends: Int32Array.of(text.length), kinds: Uint8Array.of(0)} : {ends: new Int32Array(0), kinds: new Uint8Array(0)};
	return reading === 'markdown' ? _rapierMarkdownRuns(text, 0) : reading === 'diff' ? _rapierDiffRuns(text) : _rapierCodeSpanRuns(text);
}
function _rapierRunSpans({ends, kinds}) {
	const spans = new Array(ends.length);
	for (let i = 0, start = 0; i < ends.length; start = ends[i++]) spans[i] = {start, end: ends[i], type: _RAPIER_TOKEN_TYPES[kinds[i]]};
	return spans;
}

function _rapierCodeSpanList(text) {
	let ends = new Int32Array(256), kinds = new Uint8Array(256), count = 0, covered = 0;
	const add = (end, kind) => {
		if (count > 0 && kinds[count - 1] === kind) { ends[count - 1] = end; return; }
		if (count === ends.length) {
			const grownEnds = new Int32Array(count * 2), grownKinds = new Uint8Array(count * 2);
			grownEnds.set(ends); grownKinds.set(kinds);
			ends = grownEnds; kinds = grownKinds;
		}
		ends[count] = end; kinds[count++] = kind;
	};
	const colour = (start, end, type) => {
		if (start < covered || end <= start) return;
		if (start > covered) add(start, 0);
		add(end, _RAPIER_TOKEN_KIND[type]);
		covered = end;
	};
	const finish = () => {
		if (covered < text.length) add(text.length, 0);
		return {ends: ends.subarray(0, count), kinds: kinds.subarray(0, count)};
	};
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
function _rapierCodeBreakChar(c) {
	return c === 32 || c === 9 || c === 10 || c === 13 || c !== c;
}

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
	return _rapierRunSpans(_rapierCodeSpanRuns(text));
}
function _rapierCodeSpanRuns(text) {
	const n = text.length, {colour, finish, next, lineEnd} = _rapierCodeSpanList(text);
	const {hashOnly, dash} = _rapierCodeCommentMarks(text);
	const sql = /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(text);
	const lineStartsAt = i => { let k = i - 1; while (text.charCodeAt(k) === 32 || text.charCodeAt(k) === 9) k--; return k < 0 || text.charCodeAt(k) === 10; };
	const significantBefore = i => { let k = i - 1; while (text.charCodeAt(k) === 32 || text.charCodeAt(k) === 9) k--; return k; };
	const quoted = (from, quote) => {
		for (let i = from; i < n; i++) {
			const c = text.charCodeAt(i);
			if (c === 92) i++;
			else if (c === quote) return i + 1;
			else if (c === 10) return i;
		}
		return n;
	};
	const closedBy = (from, mark, open) => { const at = next(mark, from); return at < 0 ? lineEnd(open) : at + mark.length; };
	let tickMissing = n + 1, wordStart = 0, wordStop = 0, wordEnd = -1, lifetimeEnd = -1, angle = null, wordClass = 0;
	for (let at = 0; at < n;) {
		const c = text.charCodeAt(at);
		let end = at + 1, type = 'plain';
		if (c < 128 && _RAPIER_CODE_PLAIN_TABLE[c] === 1) {
			for (let next; end < n && (next = text.charCodeAt(end)) < 128 && _RAPIER_CODE_PLAIN_TABLE[next] === 1;) end++;
		} else if (angle && angle[0] === at) {
			end = angle[1]; type = 'string'; angle = null;
		} else {
			const before = text.charCodeAt(at - 1);
			if (c >= 97 && c <= 122 || c >= 65 && c <= 90 || c === 95 || c >= 128) {
				while (end < n && _rapierCodeWordChar(text.charCodeAt(end))) end++;
				const after = text.charCodeAt(end), length = end - at;
				const member = before === 46 || before === 58 && text.charCodeAt(at - 2) === 58 || before === 62 && text.charCodeAt(at - 2) === 45;
				let blank = wordEnd >= 0;
				for (let k = wordEnd; blank && k < at; k++) blank = text.charCodeAt(k) === 32 || text.charCodeAt(k) === 9;
				if ((after === 34 || after === 39) && length <= 2 && _RAPIER_CODE_STRING_PREFIXES.has(text.slice(at, end).toLowerCase())) {
					end = text.startsWith(after === 34 ? '"""' : "'''", end) ? closedBy(end + 3, after === 34 ? '"""' : "'''", at) : quoted(end + 1, after);
					type = 'string';
				} else if (blank && wordEnd < at && _RAPIER_CODE_DEFINERS.has(text.slice(wordStart, wordStop))) type = 'function';
				else if ((wordClass = _rapierCodeWordClass(text, at, end)) & 1 && !member) type = 'keyword';
				else if (wordClass & 2) type = 'constant';
				else if (wordClass & 4) type = 'type';
				else if (c >= 65 && c <= 90 && length > 1 && /^[A-Z][A-Z0-9_]+$/.test(text.slice(at, end))) {
					const lower = text.slice(at, end).toLowerCase();
					type = !member && (_RAPIER_CODE_WORDS.has(lower) || sql && _RAPIER_CODE_SQL_WORDS.has(lower)) ? 'keyword' : after === 40 ? 'function' : 'constant';
				} else if (after === 40 || after === 33 && (text.charCodeAt(end + 1) === 40 || text.charCodeAt(end + 1) === 91 || text.charCodeAt(end + 1) === 123)) {
					if (after === 33) end++;
					type = 'function';
				} else if (c >= 65 && c <= 90) type = before === 62 && text.charCodeAt(at - 2) !== 45 && text.charCodeAt(at - 2) !== 61 ? 'plain' : 'type';
				else if ((before === 60 || before === 47 && text.charCodeAt(at - 2) === 60) && (_rapierCodeBreakChar(after) || after === 47 || after === 62)) type = 'keyword';
				else if (length > 2 && text.charCodeAt(end - 2) === 95 && text.charCodeAt(end - 1) === 116) type = 'type';
				if (type !== 'string') { wordStart = at; wordStop = at + length; wordEnd = end; }
			} else {
				const d = text.charCodeAt(at + 1);
				if (c === 47 && d === 47 && !hashOnly && before !== 58) {
					end = lineEnd(at); type = 'comment';
				} else if (c === 47 && d === 42 && !hashOnly && !_rapierCodeWordChar(before) && before !== 42 && before !== 46) {
					end = closedBy(at + 2, '*/', at); type = 'comment';
				} else if (c === 60 && text.startsWith('<!--', at)) {
					end = closedBy(at + 4, '-->', at); type = 'comment';
				} else if (c === 35 && !_rapierCodeWordChar(before) && before !== 36 && before !== 38) {
					let hex = at + 1;
					while (hex < at + 10 && /[0-9a-f]/i.test(text[hex] || '')) hex++;
					if (hashOnly || _rapierCodeBreakChar(d) || d === 33 || d === 35) { end = lineEnd(at); type = 'comment'; }
					else if (hex - at >= 4 && hex - at <= 9 && !_rapierCodeWordChar(text.charCodeAt(hex))) { end = hex; type = 'number'; }
					else if (lineStartsAt(at) && /[A-Za-z_]/.test(text[at + 1] || '')) {
						end = at + 2;
						while (end < n && _rapierCodeWordChar(text.charCodeAt(end))) end++;
						type = 'keyword';
						let path = end;
						while (text.charCodeAt(path) === 32 || text.charCodeAt(path) === 9) path++;
						const shut = text.charCodeAt(path) === 60 && /^#(?:include|import)$/.test(text.slice(at, end)) ? next('>', path) : -1;
						if (shut > path && shut < lineEnd(path)) angle = [path, shut + 1];
					}
				} else if (c === 59 && (_rapierCodeBreakChar(d) || d === 59) && lineStartsAt(at)) {
					end = lineEnd(at); type = 'comment';
				} else if (c === 45 && d === 45 && !_rapierCodeWordChar(before) && before !== 45 &&
						_rapierCodeBreakChar(text.charCodeAt(at + 2)) && (dash || lineStartsAt(at))) {
					end = lineEnd(at); type = 'comment';
				} else if ((c === 34 || c === 39) && text.startsWith(c === 34 ? '"""' : "'''", at)) {
					end = closedBy(at + 3, c === 34 ? '"""' : "'''", at); type = 'string';
				} else if (c === 34) {
					end = quoted(at + 1, 34); type = 'string';
				} else if (c === 39) {
					if (!_rapierCodeWordChar(before)) {
						let run = at + 1;
						if (/[A-Za-z_]/.test(text[run] || '')) while (run < n && _rapierCodeWordChar(text.charCodeAt(run))) run++;
						const prior = significantBefore(at), near = (from, span) => from >= 0 && at - from <= span ? text.slice(from, at) : null;
						const chain = near(lifetimeEnd, 8), label = near(wordEnd, 8);
						const close = quoted(at + 1, 39), closed = close > at + 1 && text.charCodeAt(close - 1) === 39;
						const lifetime = run > at + 1 && text.charCodeAt(run) !== 39 && (!closed || before === 38 || before === 60 ||
							chain !== null && /^[ \t]*[,:+][ \t]*$/.test(chain) ||
							text.slice(at + 1, run) === 'static' && (text.charCodeAt(prior) === 43 || text.charCodeAt(prior) === 44 || text.charCodeAt(prior) === 58) ||
							_RAPIER_CODE_LABELLERS.has(text.slice(wordStart, wordStop)) && label !== null && !label.trim() ||
							text.charCodeAt(run) === 58 && lineStartsAt(at));
						if (lifetime) { end = run; type = 'type'; lifetimeEnd = run; }
						else { end = close; type = 'string'; }
					}
				} else if (c === 96) {
					type = 'string';
					end = lineEnd(at);
					if (at < tickMissing) {
						let i = at + 1;
						for (; i < n; i++) { const t = text.charCodeAt(i); if (t === 92) i++; else if (t === 96) break; }
						if (i < n) end = i + 1;
						else tickMissing = at;
					}
				} else if (c >= 48 && c <= 57) {
					end = at + 1;
					if (c === 48 && /[xXbBoO]/.test(text[at + 1] || '')) end = at + 2;
					while (end < n && (text.charCodeAt(end) >= 48 && text.charCodeAt(end) <= 57 || text.charCodeAt(end) === 95)) end++;
					if (text.charCodeAt(end) === 46 && text.charCodeAt(end + 1) >= 48 && text.charCodeAt(end + 1) <= 57) {
						end += 2;
						while (end < n && (text.charCodeAt(end) >= 48 && text.charCodeAt(end) <= 57 || text.charCodeAt(end) === 95)) end++;
					}
					if ((text.charCodeAt(end) | 32) === 101) {
						const sign = text.charCodeAt(end + 1) === 43 || text.charCodeAt(end + 1) === 45 ? 1 : 0;
						if (text.charCodeAt(end + 1 + sign) >= 48 && text.charCodeAt(end + 1 + sign) <= 57) end += 1 + sign;
					}
					while (end < n && _rapierCodeWordChar(text.charCodeAt(end))) end++;
					type = 'number';
				} else if (c < 128 && _RAPIER_CODE_OPERATOR_TABLE[c] === 1) type = 'operator';
			}
		}
		if (type !== 'plain') colour(at, end, type);
		at = end;
	}
	return finish();
}

function _rapierDiffTokens(text) {
	return _rapierRunSpans(_rapierDiffRuns(text));
}
function _rapierDiffRuns(text) {
	const n = text.length, {colour, finish, lineEnd} = _rapierCodeSpanList(text);
	for (let at = 0; at < n;) {
		const end = lineEnd(at), c = text.charCodeAt(at);
		if (/^(?:diff |index |Index: |--- |\+\+\+ |@@|\*\*\*|===)/.test(text.slice(at, Math.min(end, at + 7))) || c === 45 || c === 60) colour(at, end, 'comment');
		else if (c === 43 || c === 62 || c === 33) colour(at, end, 'string');
		at = end + 1;
	}
	return finish();
}

function _rapierMarkdownTokens(text, depth) {
	return _rapierRunSpans(_rapierMarkdownRuns(text, depth));
}
function _rapierMarkdownRuns(text, depth) {
	const n = text.length, {colour, finish, next, lineEnd} = _rapierCodeSpanList(text);
	const embed = (from, to, language) => {
		if (to <= from) return;
		const reading = _rapierCodeReading(language), body = text.slice(from, to);
		if (reading !== 'code' && (reading !== 'markdown' || depth >= 1)) return;
		const {ends, kinds} = reading === 'code' ? _rapierCodeSpanRuns(body) : _rapierMarkdownRuns(body, depth + 1);
		for (let i = 0, start = 0; i < ends.length; start = ends[i++]) colour(from + start, from + ends[i], _RAPIER_TOKEN_TYPES[kinds[i]]);
	};
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
			const stop = inline(at, end);
			midLine = stop > end;
			at = midLine ? stop : after;
			continue;
		}
		const line = text.slice(at, end);
		if (fence) {
			const shut = /^ {0,3}(`+|~+)[ \t]*\r?$/.exec(line);
			if (shut && shut[1][0] === fence.mark && shut[1].length >= fence.size) {
				embed(fence.body, at, fence.info || 'text');
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
	if (fence) embed(fence.body, n, fence.info || 'text');
	return finish();
}

const _RAPIER_TOKEN_OPEN = new Map(_RAPIER_TOKEN_TYPES.slice(1).map(type => [type, '<span class="tok-' + type + '">']));
const _RAPIER_TOKEN_OPEN_BY_KIND = _RAPIER_TOKEN_TYPES.map(type => _RAPIER_TOKEN_OPEN.get(type));
function _rapierHtmlWriter(source) {
	const marks = [];
	for (let i = source.indexOf('&'); i >= 0; i = source.indexOf('&', i + 1)) marks.push(i);
	const lt = marks.length;
	for (let i = source.indexOf('<'); i >= 0; i = source.indexOf('<', i + 1)) marks.push(i);
	const gt = marks.length;
	for (let i = source.indexOf('>'); i >= 0; i = source.indexOf('>', i + 1)) marks.push(i);
	if ((lt > 0) + (gt > lt) + (marks.length > gt) > 1) marks.sort((a, b) => a - b);
	let mark = 0;
	return (start, end) => {
		if (mark >= marks.length || marks[mark] >= end) return source.slice(start, end);
		let text = '', from = start;
		for (; mark < marks.length && marks[mark] < end; mark++) {
			const at = marks[mark], ch = source.charCodeAt(at);
			text += source.slice(from, at) + (ch === 38 ? '&amp;' : ch === 60 ? '&lt;' : '&gt;');
			from = at + 1;
		}
		return text + source.slice(from, end);
	};
}
function _rapierTokensHtml(source, spans) {
	const write = _rapierHtmlWriter(source);
	let html = '', at = 0;
	for (const span of spans) {
		if (!span || span.start !== at || !(span.end >= span.start) || span.end > source.length) throw new Error('code token order');
		const open = _RAPIER_TOKEN_OPEN.get(span.type);
		html += open === undefined ? write(at, span.end) : open + write(at, span.end) + '</span>';
		at = span.end;
	}
	if (at !== source.length) throw new Error('code token coverage');
	return html;
}

function _rapierCodeHtml(source, language) {
	const text = typeof source === 'string' ? source : String(source ?? '');
	const {ends, kinds} = _rapierCodeRuns(text, language), write = _rapierHtmlWriter(text);
	let html = '';
	for (let i = 0, start = 0; i < ends.length; start = ends[i++]) {
		const kind = kinds[i];
		html += kind === 0 ? write(start, ends[i]) : _RAPIER_TOKEN_OPEN_BY_KIND[kind] + write(start, ends[i]) + '</span>';
	}
	return html;
}

export { RAPIER_CODE_COLOUR_MAX_CHARS, _RAPIER_HIGHLIGHT_SLAB_MAX_CHARS, _RAPIER_HIGHLIGHT_LINE_MAX_CHARS,
	_rapierHighlightLinesAdmitted, _rapierHighlightAdmitted, _RAPIER_CODE_WORDS, _RAPIER_CODE_SQL_WORDS, _RAPIER_CODE_CONSTANTS, _RAPIER_CODE_TYPES, _RAPIER_CODE_PLAIN, _RAPIER_CODE_STRING_PREFIXES,
	_RAPIER_CODE_DEFINERS, _RAPIER_CODE_LABELLERS, _RAPIER_CODE_OPERATORS, _RAPIER_CODE_CLASS, _RAPIER_CODE_CLASS_WORDS, _RAPIER_CODE_CLASS_BITS,
	_RAPIER_CODE_CLASS_SLOTS, _rapierCodeWordHash, _RAPIER_CODE_CLASS_LENGTHS, _rapierCodeWordClass, _RAPIER_CODE_OPERATOR_TABLE, _RAPIER_CODE_PLAIN_TABLE,
	_RAPIER_TOKEN_TYPES, _RAPIER_TOKEN_KIND, _rapierCodeReading, tokenizeCode, _rapierCodeRuns, _rapierRunSpans, _rapierCodeSpanList, _rapierCodeWordChar, _rapierCodeBreakChar,
	_rapierCodeCommentMarks, _rapierCodeSpans, _rapierCodeSpanRuns, _rapierDiffTokens, _rapierDiffRuns, _rapierMarkdownTokens, _rapierMarkdownRuns,
	_RAPIER_TOKEN_OPEN, _RAPIER_TOKEN_OPEN_BY_KIND, _rapierHtmlWriter, _rapierTokensHtml, _rapierCodeHtml };
