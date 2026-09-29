import acorn from './vendor/acorn.mjs';
import { structureRequest } from './structure-request.mjs';
const self = {acorn};
function _rapierStructureAnalyze(request) {
	/* Receipt is two immutable roots but one question, one budget. Run the same index owner sequentially inside this Worker job; give the second root only what the first didn't spend. No second realm, queue position, timer or reset turns the pair into two answers. */
	if (request && request.mode === 'receipt' && request.before && request.after) {
		var pairLimits = request.limits || {};
		var defaults = {
			tokens: 600000, nodes: 600000, depth: 1200, units: 64,
			declarations: 4096, occurrences: 200000, bindings: 100000, scopes: 20000,
			entries: 2048, matches: 200, strings: 786432, resultBytes: 1048576,
		};
		function declared(name) {
			return pairLimits[name] == null ? defaults[name] : Math.max(0, Number(pairLimits[name]));
		}
		var before = _rapierStructureAnalyze({
			mode: 'facts', kind: request.kind, source: String(request.before.source || ''),
			identity: request.before.identity || null, dialect: request.dialect,
			globals: request.globals || [], limits: pairLimits,
		});
		var remaining = {};
		var additive = ['tokens', 'nodes', 'units', 'declarations', 'occurrences', 'bindings',
			'scopes', 'entries', 'matches', 'strings'];
		for (var ri = 0; ri < additive.length; ri++) {
			var dimension = additive[ri];
			remaining[dimension] = Math.max(0, declared(dimension) - Number(before.budget && before.budget.used && before.budget.used[dimension] || 0));
		}
		remaining.depth = declared('depth');
		remaining.resultBytes = declared('resultBytes');
		var after = _rapierStructureAnalyze({
			mode: 'facts', kind: request.kind, source: String(request.after.source || ''),
			identity: request.after.identity || null, dialect: request.dialect,
			globals: request.globals || [], limits: remaining,
		});
		var aggregateUsed = {};
		for (var au = 0; au < additive.length; au++) {
			var usedName = additive[au];
			aggregateUsed[usedName] = Number(before.budget && before.budget.used && before.budget.used[usedName] || 0) +
				Number(after.budget && after.budget.used && after.budget.used[usedName] || 0);
		}
		aggregateUsed.depth = Math.max(Number(before.bounds && before.bounds.depth || 0), Number(after.bounds && after.bounds.depth || 0));
		aggregateUsed.resultBytes = 0;
		function compact(index) {
			return {
				ok: index.ok, status: index.status, complete: index.complete,
				identity: index.identity || null, omissions: index.omissions || [],
				budget: index.budget, units: index.units || [], declarations: index.declarations || [],
				imports: index.imports || [], exports: index.exports || [], unresolved: index.unresolved || [],
				parse: index.parse || null, bounds: index.bounds || null,
			};
		}
		var pairOmissions = [];
		(before.omissions || []).forEach(function (row) { pairOmissions.push(Object.assign({ side: 'before' }, row)); });
		(after.omissions || []).forEach(function (row) { pairOmissions.push(Object.assign({ side: 'after' }, row)); });
		var pairStatus = before.status === 'syntax_error' || after.status === 'syntax_error'
			? 'syntax_error' : pairOmissions.length ? 'bounded' : 'ok';
		return {
			ok: true, engine: 'acorn@8.18.0', mode: 'receipt', status: pairStatus,
			complete: before.complete === true && after.complete === true,
			omissions: pairOmissions,
			budget: { limits: Object.assign({}, defaults, pairLimits), used: aggregateUsed },
			before: compact(before), after: compact(after),
		};
	}
	var acornRef = (typeof self !== 'undefined' && self.acorn) ||
		(typeof globalThis !== 'undefined' && globalThis.acorn) || null;
	var source = String((request && request.source) || '');
	var docKind = String((request && request.kind) || 'javascript');
	var dialect = String((request && request.dialect) || 'infer');
	var mode = String((request && request.mode) || 'index');
	var query = String((request && request.query) || '');
	var wanted = (request && request.kinds) || null;
	var within = (request && request.within) || null;
	var requestedMatchOffset = Math.max(0, Math.min(2048,
		Number(request && request.matchOffset || 0) || 0));
	var requestedMatchLimit = Math.max(0, Number(request && request.matchLimit || 0) || 0);
	var limits = (request && request.limits) || {};
	function limit(name, fallback) {
		return limits[name] == null ? fallback : Math.max(0, Number(limits[name]));
	}
	var LIMIT = {
		tokens: limit('tokens', 600000), nodes: limit('nodes', 600000),
		depth: limit('depth', 1200),
		units: limits.units == null ? limit('scripts', 64) : limit('units', 64),
		declarations: limit('declarations', 4096),
		occurrences: limit('occurrences', 200000),
		bindings: limit('bindings', 100000), scopes: limit('scopes', 20000),
		entries: limit('entries', 2048), matches: limit('matches', 200),
		strings: limit('strings', 786432),
		// Effective floor 512 bytes: a bounded reply needs room to name its bound.
		resultBytes: Math.max(512, limit('resultBytes', 1048576)),
	};
	var used = {
		tokens: 0, nodes: 0, depth: 0, units: 0, declarations: 0,
		occurrences: 0, bindings: 0, scopes: 0, entries: 0, matches: 0,
		strings: 0, resultBytes: 0,
	};
	var omissions = [];
	var bounded = false;
	var resolutionComplete = true;
	var BUDGET = { marker: 'rapier-structure-budget' };
	var SKIP = { type: 1, start: 1, end: 1, loc: 1, range: 1, sourceFile: 1 };

	function fnv(text) {
		var hash = 0x811c9dc5;
		for (var i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
		return (hash >>> 0).toString(16);
	}
	/* Outline tickets use the editor's ordinary two-hash integrity record. Keep that private
		 witness meaningful inside the Worker too, so a scoped find/read can be projected from the
		 SAME disposable index without shipping every occurrence back to the main realm. */
	function outlineIntegrity(text) {
		var value = String(text == null ? '' : text);
		var a = 1, b = 0, oi = 0, n = value.length;
		while (oi < n) {
			var end = Math.min(n, oi + 4096);
			for (; oi < end; oi++) { a += value.charCodeAt(oi); b += a; }
			a %= 65521; b %= 65521;
		}
		return {
			chars: value.length,
			fnv: (parseInt(fnv(value), 16) >>> 0).toString(36),
			adler: (((b << 16) | a) >>> 0).toString(36),
		};
	}
	function sameIntegrity(expected, actual) {
		return !!expected && !!actual && Number(expected.chars) === Number(actual.chars) &&
			String(expected.fnv || '') === String(actual.fnv || '') &&
			String(expected.adler || '') === String(actual.adler || '');
	}
	function utf8Bytes(text) {
		var count = 0;
		for (var i = 0; i < text.length; i++) {
			var code = text.charCodeAt(i);
			if (code < 0x80) count += 1;
			else if (code < 0x800) count += 2;
			else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length &&
					text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
				count += 4; i += 1;
			} else count += 3;
		}
		return count;
	}
	function omission(domain, reason, observed, emitted, exact, unit) {
		var row = {
			domain: String(domain), reason: String(reason),
			observed: observed == null ? null : Number(observed),
			emitted: emitted == null ? null : Number(emitted),
			omitted: observed == null || emitted == null ? null : Math.max(0, Number(observed) - Number(emitted)),
			exact: exact === true, unit: unit == null ? null : Number(unit),
		};
		for (var i = 0; i < omissions.length; i++) {
			var old = omissions[i];
			if (old.domain === row.domain && old.reason === row.reason && old.unit === row.unit) {
				if (row.reason === 'string_bytes') {
					var oldOmitted = Math.max(0, Number(old.omitted || 0));
					var rowOmitted = Math.max(0, Number(row.omitted || 0));
					old.emitted = Math.max(Number(old.emitted || 0), Number(row.emitted || 0));
					old.omitted = oldOmitted + rowOmitted;
					old.observed = old.emitted + old.omitted;
					old.exact = old.exact === true && row.exact === true;
					return;
				}
				if (row.reason === 'field_length') {
					old.observed = Number(old.observed || 0) + Number(row.observed || 0);
					old.emitted = Number(old.emitted || 0) + Number(row.emitted || 0);
					old.omitted = Math.max(0, Number(old.omitted || 0)) +
						Math.max(0, Number(row.omitted || 0));
					old.exact = old.exact === true && row.exact === true;
					return;
				}
				omissions[i] = row; return;
			}
		}
		omissions.push(row);
	}
	function spend(name, amount) {
		amount = Number(amount || 1);
		used[name] += amount;
		if (used[name] > LIMIT[name]) {
			used[name] = LIMIT[name];
			bounded = true;
			BUDGET.dimension = name;
			throw BUDGET;
		}
	}
	function wireText(value, domain) {
		var text = String(value == null ? '' : value);
		var clipped = text.length > 2000 ? text.slice(0, 1999) + '…' : text;
		var bytes = utf8Bytes(clipped);
		if (used.strings + bytes > LIMIT.strings) {
			bounded = true;
			omission(domain || 'strings', 'string_bytes', used.strings + bytes, used.strings, false, null);
			return '';
		}
		used.strings += bytes;
		if (clipped !== text) omission(domain || 'strings', 'field_length', text.length, clipped.length, true, null);
		return clipped;
	}
	function childEdges(node) {
		var out = [];
		for (var key in node) {
			if (SKIP[key]) continue;
			var value = node[key];
			if (!value || typeof value !== 'object') continue;
			if (Array.isArray(value)) {
				for (var i = 0; i < value.length; i++) {
					if (value[i] && typeof value[i].type === 'string') out.push({ node: value[i], key: key, index: i });
				}
			} else if (typeof value.type === 'string') out.push({ node: value, key: key, index: -1 });
		}
		return out;
	}
	function keyName(node, computed, base) {
		if (!node) return '';
		if (computed && typeof node.start === 'number') {
			var absolute = Number(base || 0) + node.start;
			/* Preserve authored key whole until the wire-string budget clips it and
				 records that fact. Closing a silent 120-byte prefix with `]` fabricates a different key. */
			return '[' + source.slice(absolute, Number(base || 0) + node.end)
				.replace(/[\r\n]+/g, ' ') + ']';
		}
		if (node.type === 'Identifier') return node.name;
		if (node.type === 'PrivateIdentifier') return '#' + node.name;
		if (node.type === 'Super') return 'super';
		if (node.type === 'Literal') return String(node.value == null ? '' : node.value);
		return '';
	}
	function memberPath(node, base) {
		if (!node || typeof node.start !== 'number' || typeof node.end !== 'number') return '';
		// A member's identity is its authored expression, never prettified.
		return source.slice(Number(base || 0) + node.start, Number(base || 0) + node.end);
	}

	/* Absolute coordinates are a property of the captured document, never an inline unit. */
	var lineStarts = [0];
	for (var li = 0; li < source.length; li++) {
		var lc = source.charCodeAt(li);
		if (lc === 13) {
			if (source.charCodeAt(li + 1) === 10) li += 1;
			lineStarts.push(li + 1);
		} else if (lc === 10 || lc === 0x2028 || lc === 0x2029) lineStarts.push(li + 1);
	}
	function locationAt(position) {
		var lo = 0, hi = lineStarts.length;
		while (lo + 1 < hi) {
			var mid = (lo + hi) >> 1;
			if (lineStarts[mid] <= position) lo = mid; else hi = mid;
		}
		return { line: lo + 1, column: Math.max(0, position - lineStarts[lo]) };
	}

	function asciiLower(text) { return String(text || '').replace(/[A-Z]/g, function (c) { return c.toLowerCase(); }); }
	function space(c) { return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f'; }
	function tagDelimiter(c) { return !c || space(c) || c === '/' || c === '>'; }
	function parseTag(at) {
		if (source.charAt(at) !== '<') return null;
		var cursor = at + 1;
		var closing = false;
		if (source.charAt(cursor) === '/') { closing = true; cursor += 1; }
		/* Tag-open/end-tag-open accept an ASCII letter immediately. Whitespace
			 after `<` or `</` is text/bogus markup, never a tag whose delayed name
			 may swallow the next real script. Once admitted, the name consumes
			 every non-delimiter byte. */
		if (!/[A-Za-z]/.test(source.charAt(cursor))) return null;
		var nameStart = cursor;
		/* HTML tag names consume every non-delimiter byte. Stopping at an ASCII whitelist turns a NUL-carrying script name into the ordinary script name, even though the browser replaces that NUL and creates no script element — exactly the ghost this scanner exists to refuse. */
		while (source.charAt(cursor) && !space(source.charAt(cursor)) &&
				source.charAt(cursor) !== '/' && source.charAt(cursor) !== '>') cursor += 1;
		if (cursor === nameStart) return null;
		var name = asciiLower(source.slice(nameStart, cursor));
		var attrs = Object.create(null);
		var uncertainAttrs = Object.create(null);
		var selfClosing = false;
		while (cursor < source.length) {
			while (space(source.charAt(cursor))) cursor += 1;
			var ch = source.charAt(cursor);
			if (ch === '>') return { start: at, end: cursor + 1, name: name, attrs: attrs,
				uncertainAttrs: uncertainAttrs, closing: closing, selfClosing: selfClosing, emitted: true };
			if (ch === '/' && source.charAt(cursor + 1) === '>') {
				selfClosing = true;
				return { start: at, end: cursor + 2, name: name, attrs: attrs,
					uncertainAttrs: uncertainAttrs, closing: closing, selfClosing: true, emitted: true };
			}
			if (!ch) break;
			var attrStart = cursor;
			while (cursor < source.length && !space(source.charAt(cursor)) &&
					(source.charAt(cursor) !== '=' || cursor === attrStart) &&
					source.charAt(cursor) !== '>' && source.charAt(cursor) !== '/') cursor += 1;
			if (cursor === attrStart) { cursor += 1; continue; }
			var attrName = asciiLower(source.slice(attrStart, cursor));
			while (space(source.charAt(cursor))) cursor += 1;
			var value = '';
			if (source.charAt(cursor) === '=') {
				cursor += 1;
				while (space(source.charAt(cursor))) cursor += 1;
				var quote = source.charAt(cursor);
				if (quote === '"' || quote === "'") {
					cursor += 1;
					var valueStart = cursor;
					while (cursor < source.length && source.charAt(cursor) !== quote) cursor += 1;
					value = source.slice(valueStart, cursor);
					if (source.charAt(cursor) === quote) cursor += 1;
				} else {
					var bareStart = cursor;
					while (cursor < source.length && !space(source.charAt(cursor)) && source.charAt(cursor) !== '>') cursor += 1;
					value = source.slice(bareStart, cursor);
				}
			}
			if (!(attrName in attrs)) {
				var decoded = decodeAttributeValue(value);
				attrs[attrName] = decoded.value;
				if (decoded.uncertain) uncertainAttrs[attrName] = true;
			}
		}
		/* EOF in any tag state emits no tag token. Keep the consumed extent so
			 the outer scanner doesn't rediscover `<script>`-looking bytes inside an
			 unfinished quoted attribute. */
		return { start: at, end: source.length, name: name, attrs: attrs,
			uncertainAttrs: uncertainAttrs, closing: closing, selfClosing: selfClosing, emitted: false };
	}
	var ATTRIBUTE_ENTITIES = {
		amp: '&', AMP: '&', apos: "'", ast: '*', bsol: '\\', colon: ':', comma: ',',
		commat: '@', dollar: '$', equals: '=', excl: '!', gt: '>', GT: '>',
		lpar: '(', lsqb: '[', lt: '<', LT: '<', num: '#', percnt: '%', period: '.',
		plus: '+', quest: '?', quot: '"', QUOT: '"', rpar: ')', rsqb: ']', semi: ';',
		sol: '/', Tab: '\t', NewLine: '\n', vert: '|', VerticalLine: '|',
	};
	var ATTRIBUTE_LEGACY_NO_SEMI = { amp: 1, AMP: 1, gt: 1, GT: 1, lt: 1, LT: 1, quot: 1, QUOT: 1 };
	function decodeAttributeValue(text) {
		var raw = String(text || '');
		var uncertain = false;
		var value = raw.replace(/&(?:#(?:[xX][0-9a-fA-F]+|[0-9]+);?|[A-Za-z][A-Za-z0-9]+;?)/g,
			function (token) {
				var body = token.slice(1).replace(/;$/, '');
				if (body.charAt(0) === '#') {
					var hex = body.charAt(1).toLowerCase() === 'x';
					var numeric = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
					if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 0x10ffff ||
							(numeric >= 0xd800 && numeric <= 0xdfff)) return '\ufffd';
					try { return String.fromCodePoint(numeric); } catch (_) { return '\ufffd'; }
				}
				if (Object.prototype.hasOwnProperty.call(ATTRIBUTE_ENTITIES, body)) {
					/* Most named references require their semicolon: treating `&Tab` as TAB
						 would turn a data-block MIME into executable JavaScript, though the
						 HTML tokenizer leaves those bytes alone. Only the tiny legacy set is
						 legal without `;`; anything else touching a relevant attribute is an
						 honest withdrawal. */
					if (!/;$/.test(token) && !ATTRIBUTE_LEGACY_NO_SEMI[body]) {
						uncertain = true;
						return token;
					}
					return ATTRIBUTE_ENTITIES[body];
				}
				uncertain = true;
				return token;
			});
		return { value: value, uncertain: uncertain };
	}
	var lowerSource = asciiLower(source);
	function declarationEnd(at) {
		var doctype = lowerSource.slice(at, at + 9) === '<!doctype' &&
			tagDelimiter(lowerSource.charAt(at + 9));
		if (!doctype) {
			var ordinary = source.indexOf('>', at + 2);
			return ordinary < 0 ? source.length : ordinary + 1;
		}
		var cursor = at + 9;
		while (space(source.charAt(cursor))) cursor += 1;
		while (source.charAt(cursor) && !space(source.charAt(cursor)) && source.charAt(cursor) !== '>') cursor += 1;
		while (space(source.charAt(cursor))) cursor += 1;
		if (source.charAt(cursor) === '>') return cursor + 1;
		var keywordStart = cursor;
		while (/[A-Za-z]/.test(source.charAt(cursor))) cursor += 1;
		var keyword = asciiLower(source.slice(keywordStart, cursor));
		if (keyword !== 'public' && keyword !== 'system') {
			var bogusAt = source.indexOf('>', keywordStart);
			return bogusAt < 0 ? source.length : bogusAt + 1;
		}
		function bogus(from) {
			var end = source.indexOf('>', from);
			return end < 0 ? source.length : end + 1;
		}
		/* Once PUBLIC/SYSTEM's quoted identifiers complete, an unexpected byte
			 enters bogus-DOCTYPE state — quotes have no magic there, the first `>`
			 closes it. A generic quote scanner would swallow real markup behind an
			 invalid extra token. */
		if (!space(source.charAt(cursor))) return bogus(cursor);
		while (space(source.charAt(cursor))) cursor += 1;
		function quoted(from) {
			var mark = source.charAt(from);
			if (mark !== '"' && mark !== "'") return -1;
			var close = source.indexOf(mark, from + 1);
			return close < 0 ? source.length : close + 1;
		}
		cursor = quoted(cursor);
		if (cursor < 0 || cursor >= source.length) return cursor < 0 ? bogus(keywordStart) : source.length;
		if (source.charAt(cursor) === '>') return cursor + 1;
		if (!space(source.charAt(cursor))) return bogus(cursor);
		while (space(source.charAt(cursor))) cursor += 1;
		if (source.charAt(cursor) === '>') return cursor + 1;
		if (keyword === 'system') return bogus(cursor);
		cursor = quoted(cursor);
		if (cursor < 0 || cursor >= source.length) return cursor < 0 ? bogus(keywordStart) : source.length;
		if (source.charAt(cursor) === '>') return cursor + 1;
		if (!space(source.charAt(cursor))) return bogus(cursor);
		while (space(source.charAt(cursor))) cursor += 1;
		return source.charAt(cursor) === '>' ? cursor + 1 : bogus(cursor);
	}
	function rawEnd(name, from) {
		var needle = '</' + name;
		var cursor = from;
		for (;;) {
			var at = lowerSource.indexOf(needle, cursor);
			if (at < 0) return { bodyEnd: source.length, after: source.length };
			/* At EOF, an unfinished end-tag candidate is emitted as raw/script text, not a tag. */
			if (lowerSource.charAt(at + needle.length) && tagDelimiter(lowerSource.charAt(at + needle.length))) {
				var tag = parseTag(at);
				if (tag && tag.emitted) return { bodyEnd: at, after: tag.end };
			}
			cursor = at + 2;
		}
	}
	function commentEnd(from) {
		var state = 'start';
		for (var cursor = from; cursor < source.length; cursor++) {
			var ch = source.charAt(cursor);
			if (state === 'start') {
				if (ch === '-') state = 'startDash';
				else if (ch === '>') return cursor + 1;
				else state = 'comment';
			} else if (state === 'startDash') {
				if (ch === '-') state = 'end';
				else if (ch === '>') return cursor + 1;
				else state = 'comment';
			} else if (state === 'comment') {
				if (ch === '-') state = 'endDash';
			} else if (state === 'endDash') {
				state = ch === '-' ? 'end' : 'comment';
			} else if (state === 'end') {
				if (ch === '>') return cursor + 1;
				if (ch === '!') state = 'endBang';
				else if (ch !== '-') state = 'comment';
			} else if (state === 'endBang') {
				if (ch === '>') return cursor + 1;
				state = ch === '-' ? 'endDash' : 'comment';
			}
		}
		return source.length;
	}
	function scriptEnd(from) {
		var state = 'data';
		var cursor = from;
		function closeAt(at) {
			var needle = '</' + 'script';
			if (asciiLower(source.slice(at, at + needle.length)) !== needle) return null;
			if (!source.charAt(at + needle.length) || !tagDelimiter(source.charAt(at + needle.length))) return null;
			var tag = parseTag(at);
			return tag && tag.emitted ? { bodyEnd: at, after: tag.end } : null;
		}
		function escapedLessThan(at) {
			var close = closeAt(at);
			if (close) return { close: close, state: 'escaped', cursor: at };
			var next = source.charAt(at + 1);
			if (/[A-Za-z]/.test(next)) {
				var wordAt = at + 1;
				while (/[A-Za-z]/.test(source.charAt(wordAt))) wordAt += 1;
				return {
					close: null,
					state: asciiLower(source.slice(at + 1, wordAt)) === 'script' && tagDelimiter(source.charAt(wordAt))
						? 'double' : 'escaped',
					cursor: wordAt,
				};
			}
			return { close: null, state: 'escaped', cursor: at + 1 };
		}
		function doubleLessThan(at) {
			if (source.charAt(at + 1) !== '/') return { state: 'double', cursor: at + 1 };
			var endAt = at + 2;
			while (/[A-Za-z]/.test(source.charAt(endAt))) endAt += 1;
			return {
				state: asciiLower(source.slice(at + 2, endAt)) === 'script' && tagDelimiter(source.charAt(endAt))
					? 'escaped' : 'double',
				cursor: endAt,
			};
		}
		while (cursor < source.length) {
			var ch = source.charAt(cursor);
			if (state === 'data') {
				/* Consuming the two dashes lands in escaped-dash-dash, not generic
					 escaped — the following `>` returns to data, exactly as the browser
					 tokenizer does. */
				if (source.startsWith('<!--', cursor)) { state = 'escapedDashDash'; cursor += 4; continue; }
				if (ch === '<') { var direct = closeAt(cursor); if (direct) return direct; }
			} else if (state === 'escaped') {
				if (ch === '-') state = 'escapedDash';
				else if (ch === '<') {
					var escapedStep = escapedLessThan(cursor); if (escapedStep.close) return escapedStep.close;
					state = escapedStep.state; cursor = escapedStep.cursor; continue;
				}
			} else if (state === 'escapedDash') {
				if (ch === '-') state = 'escapedDashDash';
				else if (ch === '<') {
					var dashStep = escapedLessThan(cursor); if (dashStep.close) return dashStep.close;
					state = dashStep.state; cursor = dashStep.cursor; continue;
				} else state = 'escaped';
			} else if (state === 'escapedDashDash') {
				if (ch === '>') state = 'data';
				else if (ch === '<') {
					var dashDashStep = escapedLessThan(cursor); if (dashDashStep.close) return dashDashStep.close;
					state = dashDashStep.state; cursor = dashDashStep.cursor; continue;
				} else if (ch !== '-') state = 'escaped';
			} else if (state === 'double') {
				if (ch === '-') state = 'doubleDash';
				else if (ch === '<') {
					var doubleStep = doubleLessThan(cursor);
					state = doubleStep.state; cursor = doubleStep.cursor; continue;
				}
			} else if (state === 'doubleDash') {
				if (ch === '-') state = 'doubleDashDash';
				else if (ch === '<') {
					var doubleDashStep = doubleLessThan(cursor);
					state = doubleDashStep.state; cursor = doubleDashStep.cursor; continue;
				}
				else state = 'double';
			} else if (state === 'doubleDashDash') {
				if (ch === '>') state = 'double';
				else if (ch === '<') {
					var doubleDashDashStep = doubleLessThan(cursor);
					state = doubleDashDashStep.state; cursor = doubleDashDashStep.cursor; continue;
				}
				else if (ch !== '-') state = 'double';
			}
			cursor += 1;
		}
		return { bodyEnd: source.length, after: source.length };
	}
	var JS_MIME = {
		'application/ecmascript': 1, 'application/javascript': 1,
		'application/x-ecmascript': 1, 'application/x-javascript': 1,
		'text/ecmascript': 1, 'text/javascript': 1, 'text/javascript1.0': 1,
		'text/javascript1.1': 1, 'text/javascript1.2': 1, 'text/javascript1.3': 1,
		'text/javascript1.4': 1, 'text/javascript1.5': 1, 'text/jscript': 1,
		'text/livescript': 1, 'text/x-ecmascript': 1, 'text/x-javascript': 1,
	};
	function scriptGoal(attrs, uncertainAttrs) {
		var hasType = 'type' in attrs;
		var raw = hasType ? attrs.type : (('language' in attrs && attrs.language) ? 'text/' + attrs.language : '');
		if ((hasType && uncertainAttrs && uncertainAttrs.type) ||
				(!hasType && uncertainAttrs && uncertainAttrs.language)) {
			return { eligible: true, external: false, reason: 'html_character_reference', goal: 'unavailable', uncertain: true };
		}
		/* HTML strips ASCII whitespace from `type`, not JavaScript's Unicode-wide trim. Legacy `language` differs again: bytes prefixed with `text/`, no trimming. */
		var typeText = String(raw || '');
		if (hasType) {
			var first = 0, last = typeText.length;
			while (first < last && space(typeText.charAt(first))) first += 1;
			while (last > first && space(typeText.charAt(last - 1))) last -= 1;
			typeText = typeText.slice(first, last);
		}
		var type = asciiLower(typeText);
		if (hasType && type === 'module') {
			if ('src' in attrs) return { eligible: false, external: true, reason: 'external_script', goal: 'module' };
			return { eligible: true, external: false, reason: '', goal: 'module' };
		}
		if (!type || JS_MIME[type]) {
			if ('nomodule' in attrs) return { eligible: false, external: false, reason: 'nomodule_script', goal: '' };
			if ('src' in attrs) return { eligible: false, external: true, reason: 'external_script', goal: 'script' };
			return { eligible: true, external: false, reason: '', goal: 'script' };
		}
		return { eligible: false, external: false, reason: 'non_javascript_script', goal: '' };
	}
	function sourceUnits() {
		if (docKind !== 'html') {
			if (LIMIT.units < 1) {
				bounded = true;
				omission('units', 'unit_budget', 1, 0, true, null);
				return [];
			}
			return [{ index: 0, start: 0, end: source.length, goal: dialect, host: dialect === 'script' ? 'node-cjs' : 'ecmascript', label: '' }];
		}
		var units = [];
		var eligibleSeen = 0;
		var externalSeen = 0;
		var externalClassicSeen = 0;
		var templateDepth = 0;
		var foreignStack = [];
		var foreignUncertain = false;
		var framesetUncertain = false;
		var cursor = 0;
		var rawNames = { style: 1, title: 1, textarea: 1, xmp: 1, iframe: 1, noembed: 1, noframes: 1, noscript: 1, plaintext: 1 };
		while (cursor < source.length) {
			var lt = source.indexOf('<', cursor);
			if (lt < 0) break;
			if (source.startsWith('<!--', lt)) {
				cursor = commentEnd(lt + 4); continue;
			}
			if (source.charAt(lt + 1) === '!' || source.charAt(lt + 1) === '?') {
				if (foreignStack.length && source.startsWith('<![CDATA[', lt)) {
					var cdataEnd = source.indexOf(']]>', lt + 9);
					cursor = cdataEnd < 0 ? source.length : cdataEnd + 3;
					continue;
				}
				cursor = declarationEnd(lt); continue;
			}
			var tag = parseTag(lt);
			if (!tag) { cursor = lt + 1; continue; }
			cursor = tag.end;
			if (!tag.emitted) continue;
			if (tag.closing) {
				if ((tag.name === 'svg' || tag.name === 'math') &&
						foreignStack[foreignStack.length - 1] === tag.name) foreignStack.pop();
				if (!foreignStack.length && tag.name === 'template' && templateDepth > 0) templateDepth -= 1;
				continue;
			}
			if ((tag.name === 'svg' || tag.name === 'math') && !tag.selfClosing) foreignStack.push(tag.name);
			if (tag.name === 'frameset') framesetUncertain = true;
			if (foreignStack.length > 0 && (tag.name === 'script' || tag.name === 'template')) {
				/* Foreign-content script/template tokenization is namespace-sensitive, materially different from HTML script-data/template inertness. Ordinary icon SVGs remain cheap; a script-bearing/integration-ambiguous foreign region withdraws HTML sight instead of letting a lexical approximation swallow or invent an executable unit. */
				foreignUncertain = true;
				if (tag.name === 'script' && !tag.selfClosing) cursor = rawEnd('script', tag.end).after;
				continue;
			}
			/* Script token inside template contents is inert source, like one in an
				 attribute or comment. Track the template insertion realm while
				 scanning, rather than discovering those bytes as a document script. */
			if (tag.name === 'template') {
				templateDepth += 1;
				continue;
			}
			if (tag.name === 'script') {
				var end = scriptEnd(tag.end);
				var goal = scriptGoal(tag.attrs, tag.uncertainAttrs);
				if (templateDepth === 0 && goal.external) {
					externalSeen += 1;
					if (goal.goal === 'script') externalClassicSeen += 1;
				}
				if (templateDepth === 0 && goal.eligible && source.slice(tag.end, end.bodyEnd).trim()) {
					eligibleSeen += 1;
					if (units.length < LIMIT.units) {
						units.push({
							index: units.length, start: tag.end, end: end.bodyEnd, goal: goal.goal,
							elementStart: lt, elementEnd: end.after,
							host: 'browser', uncertain: goal.uncertain === true,
							label: '<' + 'script' + (goal.goal === 'module' ? ' type=module' : '') + '> #' + eligibleSeen,
						});
					}
				}
				cursor = end.after;
				continue;
			}
			/* RAWTEXT/RCDATA switching belongs to HTML-namespace elements. Same
				 local names inside SVG/MathML are foreign elements (or integration
				 points) — skipping to their apparent end tag can hide a
				 namespace-sensitive script before our withdrawal sees it. */
			if (!foreignStack.length && rawNames[tag.name]) {
				if (tag.name === 'plaintext') cursor = source.length;
				else {
					var raw = rawEnd(tag.name, tag.end);
					cursor = raw.after;
				}
			}
		}
		if (eligibleSeen > LIMIT.units) {
			bounded = true;
			omission('units', 'unit_budget', eligibleSeen, LIMIT.units, true, null);
		}
		if (externalSeen) omission('units', 'external_bytes', externalSeen, 0, true, null);
		if (externalClassicSeen) {
			resolutionComplete = false;
			omission('unresolved', 'external_bytes', externalClassicSeen, 0, true, null);
		}
		if (foreignUncertain) {
			omission('units', 'foreign_content', null, null, false, null);
			return [{
				index: 0, start: 0, end: 0, goal: 'unavailable', host: 'browser',
				uncertain: true, label: 'foreign-content script', unavailable: 'foreign_content',
			}];
		}
		if (framesetUncertain) {
			omission('units', 'frameset_insertion_mode', null, null, false, null);
			return [{
				index: 0, start: 0, end: 0, goal: 'unavailable', host: 'browser',
				uncertain: true, label: 'frameset document', unavailable: 'frameset_insertion_mode',
			}];
		}
		return units;
	}

	var unitSpecs = sourceUnits();
	used.units = Math.min(unitSpecs.length, LIMIT.units);
	var units = [];
	var asts = [];
	var firstSyntax = null;
	var firstBound = null;
	var BoundedParser = null;
	function boundedParser() {
		if (BoundedParser) return BoundedParser;
		if (!acornRef || !acornRef.Parser || typeof acornRef.Parser.extend !== 'function') return null;
		BoundedParser = acornRef.Parser.extend(function (Parser) {
			return class extends Parser {
				startNode() { return this.rapierStartNode(super.startNode.bind(this)); }
				startNodeAt(pos, loc) {
					return this.rapierStartNode(super.startNodeAt.bind(this), pos, loc);
				}
				rapierStartNode(start, pos, loc) {
					const depth = Number(this.__rapierNodeDepth || 0) + 1;
					if (depth > LIMIT.depth) {
						used.depth = LIMIT.depth;
						bounded = true;
						BUDGET.dimension = 'depth';
						throw BUDGET;
					}
					spend('nodes', 1);
					this.__rapierNodeDepth = depth;
					if (depth > used.depth) used.depth = depth;
					return arguments.length > 1 ? start(pos, loc) : start();
				}
				finishNode(node, type) {
					const result = super.finishNode(node, type);
					this.__rapierNodeDepth = Math.max(0, Number(this.__rapierNodeDepth || 1) - 1);
					return result;
				}
				finishNodeAt(node, type, pos, loc) {
					const result = super.finishNodeAt(node, type, pos, loc);
					this.__rapierNodeDepth = Math.max(0, Number(this.__rapierNodeDepth || 1) - 1);
					return result;
				}
			};
		});
		return BoundedParser;
	}
	function parseUnit(spec) {
		const Parser = boundedParser();
		if (!Parser || typeof Parser.parse !== 'function') return { unavailable: 'engine_unavailable' };
		if (spec.uncertain) return { unavailable: String(spec.unavailable || 'html_character_reference') };
		var goals = spec.goal === 'module' ? ['module'] : spec.goal === 'script' ? ['script'] : ['module', 'script'];
		var first = null;
		for (var g = 0; g < goals.length; g++) {
			try {
				var ast = Parser.parse(source.slice(spec.start, spec.end), {
					ecmaVersion: 'latest', sourceType: goals[g], allowHashBang: true,
					locations: false, onToken: function () { spend('tokens', 1); },
				});
				return { ast: ast, sourceType: goals[g] };
			} catch (error) {
				if (error === BUDGET) {
					var dimension = String(BUDGET.dimension || 'resource');
					return { bounded: dimension === 'tokens' ? 'token_budget'
						: dimension === 'nodes' ? 'node_budget' : dimension + '_budget' };
				}
				if (!first) {
					var absolute = Number(error && error.pos >= 0 ? spec.start + error.pos : spec.start);
					var loc = locationAt(absolute);
					first = {
						message: String((error && error.message) || 'parse failed').slice(0, 240),
						pos: absolute, line: loc.line, column: loc.column, sourceType: goals[g],
					};
				}
			}
		}
		return { syntax: first || { message: 'parse failed', pos: spec.start, line: 1, column: 0, sourceType: '' } };
	}
	function boundAst(ast, unitIndex) {
		var stack = [{ node: ast, depth: 0 }];
		var localNodes = 0;
		var localDepth = 0;
		while (stack.length) {
			var frame = stack.pop();
			localNodes += 1;
			if (frame.depth > localDepth) localDepth = frame.depth;
			if (frame.depth + 1 > used.depth) used.depth = frame.depth + 1;
			if (localNodes > LIMIT.nodes || frame.depth + 1 > LIMIT.depth) {
				used.depth = Math.min(used.depth, LIMIT.depth);
				bounded = true;
				omission(localNodes > LIMIT.nodes ? 'nodes' : 'depth',
					localNodes > LIMIT.nodes ? 'node_budget' : 'depth_budget', null, null, false, unitIndex);
				return { ok: false, nodes: localNodes, depth: localDepth };
			}
			var edges = childEdges(frame.node);
			for (var i = 0; i < edges.length; i++) stack.push({ node: edges[i].node, depth: frame.depth + 1 });
		}
		return { ok: true, nodes: localNodes, depth: localDepth };
	}
	for (var ui = 0; ui < unitSpecs.length; ui++) {
		var spec = unitSpecs[ui];
		var parsed = parseUnit(spec);
		var record = {
			index: ui, start: spec.start, end: spec.end, goal: spec.goal,
			host: spec.host, label: wireText(spec.label, 'unit_labels'), status: 'ok',
			sourceType: '', message: '', pos: -1, line: 0, column: 0, nodes: 0, depth: 0,
		};
		if (parsed.unavailable) {
			record.status = 'unavailable'; record.message = parsed.unavailable;
			if (!firstSyntax) firstSyntax = { status: 'unavailable', message: parsed.unavailable, pos: -1, line: 0, column: 0, sourceType: '' };
		} else if (parsed.bounded) {
			record.status = 'bounded'; record.message = parsed.bounded;
			if (!firstBound) firstBound = record;
			var boundDomain = /^node/.test(parsed.bounded) ? 'nodes'
				: /^depth/.test(parsed.bounded) ? 'depth' : 'tokens';
			omission(boundDomain, parsed.bounded, null, LIMIT[boundDomain], false, ui);
		} else if (parsed.syntax) {
			record.status = 'syntax_error'; record.message = parsed.syntax.message;
			record.pos = parsed.syntax.pos; record.line = parsed.syntax.line; record.column = parsed.syntax.column;
			record.sourceType = parsed.syntax.sourceType;
			if (!firstSyntax) firstSyntax = parsed.syntax;
		} else {
			record.sourceType = parsed.sourceType;
			var bounds = boundAst(parsed.ast, ui);
			record.nodes = bounds.nodes; record.depth = bounds.depth;
			if (!bounds.ok) { record.status = 'bounded'; record.message = 'resource_budget'; if (!firstBound) firstBound = record; }
			else asts.push({ ast: parsed.ast, spec: spec, sourceType: parsed.sourceType, unit: ui });
		}
		units.push(record);
	}

	var scopes = [];
	var nodeScope = new WeakMap();
	var bindingNodes = new WeakSet();
	var writeNodes = new WeakSet();
	var readWriteNodes = new WeakSet();
	var exportedNodes = new WeakSet();
	var exportReferenceNodes = new WeakSet();
	var symbols = [];
	var symbolObserved = 0;
	var declarationObserved = 0;
	var occurrenceRows = [];
	var occurrenceObserved = 0;
	var importRows = [];
	var exportRows = [];
	var unresolvedRows = [];
	var unresolvedObserved = 0;
	// Nothing declared inside a function body is a symbol; those names still bind and resolve.
	var functionBodyDepth = 0;

	function makeScope(kind, parent, varOwner, unit) {
		used.scopes += 1;
		if (used.scopes > LIMIT.scopes) {
			used.scopes = LIMIT.scopes; bounded = true; resolutionComplete = false;
			omission('scopes', 'scope_budget', null, LIMIT.scopes, false, unit); return parent;
		}
		var id = scopes.length;
		scopes.push({ id: id, kind: kind, parent: parent == null ? null : parent,
			varOwner: varOwner == null ? id : varOwner, unit: unit, names: Object.create(null),
			dynamic: false, strict: parent != null && scopes[parent] ? scopes[parent].strict === true : false });
		return id;
	}
	function varScope(scopeId) {
		var scope = scopes[scopeId];
		return scope && scope.varOwner != null ? scope.varOwner : scopeId;
	}
	function catchVarSuppressed(scopeId, targetScope, name) {
		var cursor = scopeId;
		while (cursor != null && scopes[cursor]) {
			if (scopes[cursor].suppressedVars && scopes[cursor].suppressedVars[name]) return true;
			if (cursor === targetScope) break;
			cursor = scopes[cursor].parent;
		}
		return false;
	}
	function patternIdentifiers(pattern) {
		var out = [];
		var stack = [pattern];
		while (stack.length) {
			var node = stack.pop();
			if (!node || typeof node.type !== 'string') continue;
			if (node.type === 'Identifier') { out.push(node); continue; }
			if (node.type === 'RestElement') { stack.push(node.argument); continue; }
			if (node.type === 'AssignmentPattern') { stack.push(node.left); continue; }
			if (node.type === 'ArrayPattern') {
				for (var a = 0; a < node.elements.length; a++) if (node.elements[a]) stack.push(node.elements[a]);
				continue;
			}
			if (node.type === 'ObjectPattern') {
				for (var p = 0; p < node.properties.length; p++) {
					var prop = node.properties[p];
					if (prop.type === 'RestElement') stack.push(prop.argument); else stack.push(prop.value);
				}
			}
		}
		out.sort(function (left, right) { return left.start - right.start || left.end - right.end; });
		return out;
	}
	function markAssignmentTarget(pattern, owner) {
		if (!pattern || typeof pattern.type !== 'string') return;
		if (pattern.type === 'ChainExpression') {
			markAssignmentTarget(pattern.expression, owner); return;
		}
		if (pattern.type === 'Identifier' || pattern.type === 'MemberExpression') {
			owner.add(pattern); return;
		}
		if (pattern.type === 'RestElement') { markAssignmentTarget(pattern.argument, owner); return; }
		if (pattern.type === 'AssignmentPattern') { markAssignmentTarget(pattern.left, owner); return; }
		if (pattern.type === 'ArrayPattern') {
			for (var ai = 0; ai < pattern.elements.length; ai++) markAssignmentTarget(pattern.elements[ai], owner);
			return;
		}
		if (pattern.type === 'ObjectPattern') {
			for (var pi = 0; pi < pattern.properties.length; pi++) {
				var property = pattern.properties[pi];
				markAssignmentTarget(property.type === 'RestElement' ? property.argument : property.value, owner);
			}
		}
	}
	function bindPattern(pattern, scopeId, kind, unit) {
		var names = patternIdentifiers(pattern);
		for (var i = 0; i < names.length; i++) {
			bindingNodes.add(names[i]);
			used.bindings += 1;
			if (used.bindings > LIMIT.bindings) {
				used.bindings = LIMIT.bindings; bounded = true; resolutionComplete = false;
				omission('bindings', 'binding_budget', null, LIMIT.bindings, false, unit); continue;
			}
			var name = names[i].name;
			if (!scopes[scopeId].names[name]) scopes[scopeId].names[name] = [];
			scopes[scopeId].names[name].push({
				kind: kind,
				start: Number((unitSpecs[unit] || { start: 0 }).start || 0) + names[i].start,
				end: Number((unitSpecs[unit] || { start: 0 }).start || 0) + names[i].end,
				unit: unit,
			});
		}
		return names;
	}
	function headerEnd(node) {
		if (node && node.body && typeof node.body.start === 'number') return node.body.start;
		if (node && node.value && node.value.body && typeof node.value.body.start === 'number') return node.value.body.start;
		if (node && node.init && node.init.body && typeof node.init.body.start === 'number') return node.init.body.start;
		if (node && node.right && node.right.body && typeof node.right.body.start === 'number') return node.right.body.start;
		return node && node.end || 0;
	}
	function addSymbol(kind, name, node, nameNode, unit, exported, label, forcedQualified) {
		if (!node || !name) return null;
		symbolObserved += 1;
		if (kind !== 'script') {
			declarationObserved += 1;
			used.declarations = Math.min(declarationObserved, LIMIT.declarations);
			if (declarationObserved > LIMIT.declarations) { bounded = true; return null; }
		}
		var spec = unitSpecs[unit] || { start: 0 };
		var start = spec.start + Number(node.start || 0);
		var end = spec.start + Number(node.end || node.start || 0);
		var nameStart = nameNode && typeof nameNode.start === 'number' ? spec.start + nameNode.start : -1;
		var nameEnd = nameNode && typeof nameNode.end === 'number' ? spec.start + nameNode.end : -1;
		var row = {
			ordinal: symbols.length, kind: wireText(kind, 'symbol_strings'),
			name: wireText(name, 'symbol_strings'), qualifiedName: wireText(forcedQualified || '', 'symbol_strings'),
			parent: null, depth: 0, unit: unit, exported: exported === true,
			headerSpan: { start: start, end: Math.max(start + 1, spec.start + Math.min(Number(headerEnd(node)), Number(node.end || 0))) },
			completeSpan: { start: start, end: Math.max(start + 1, end) },
			nameSpan: nameStart >= 0 ? { start: nameStart, end: Math.max(nameStart + 1, nameEnd) } : null,
			label: wireText(label || name, 'symbol_strings'),
			hash: fnv(source.slice(start, end)), import: null, export: null,
		};
		symbols.push(row);
		return row;
	}
	function recordSymbol(node, parent, unit, exported) {
		var type = node.type;
		var unitBase = Number((unitSpecs[unit] || { start: 0 }).start || 0);
		if (type === 'FunctionDeclaration') {
			return addSymbol('function', keyName(node.id) || 'default', node, node.id, unit, exported,
				(keyName(node.id) || 'default') + '()');
		}
		if (type === 'ClassDeclaration') {
			return addSymbol('class', keyName(node.id) || 'default', node, node.id, unit, exported,
				'class ' + (keyName(node.id) || 'default'));
		}
		if (type === 'VariableDeclarator' && parent && parent.type === 'VariableDeclaration') {
			var ids = patternIdentifiers(node.id);
			var rows = [];
			for (var i = 0; i < ids.length; i++) {
				var simpleBinding = node.id && node.id.type === 'Identifier';
				var valueKind = simpleBinding && node.init && (node.init.type === 'FunctionExpression' || node.init.type === 'ArrowFunctionExpression')
					? 'function' : node.init && node.init.type === 'ClassExpression' ? 'class' : 'variable';
				if (!simpleBinding) valueKind = 'variable';
				// A function-valued binding reads as the function.
				var variableSymbol = addSymbol(valueKind, ids[i].name, node, ids[i], unit, exported,
					valueKind === 'function' ? ids[i].name + '()' : parent.kind + ' ' + ids[i].name);
				if (variableSymbol) variableSymbol.declarationKind = parent.kind;
				rows.push(variableSymbol);
			}
			return rows[0] || null;
		}
		if (type === 'MethodDefinition' || type === 'PropertyDefinition') {
			var methodName = keyName(node.key, node.computed, unitBase) || '[computed]';
			var methodKind = type === 'PropertyDefinition' ? 'property' : 'method';
			return addSymbol(methodKind, methodName, node, node.computed ? null : node.key, unit, exported,
				(node.static ? 'static ' : '') + methodName + (methodKind === 'method' ? '()' : ''));
		}
		if (type === 'Property' && node.value &&
				(node.method || node.value.type === 'FunctionExpression' || node.value.type === 'ArrowFunctionExpression')) {
			var propertyName = keyName(node.key, node.computed, unitBase) || '[computed]';
			return addSymbol('method', propertyName, node, node.computed ? null : node.key, unit, exported, propertyName + '()');
		}
		if (type === 'AssignmentExpression' && node.right && node.left && node.left.type === 'MemberExpression' &&
				(node.right.type === 'FunctionExpression' || node.right.type === 'ArrowFunctionExpression' ||
					node.right.type === 'ClassExpression')) {
			var path = memberPath(node.left, unitBase);
			var last = keyName(node.left.property, node.left.computed, unitBase) || path || '[computed]';
			return addSymbol(node.right.type === 'ClassExpression' ? 'class' : 'method', last, node,
				node.left.computed ? null : node.left.property, unit, exported, path + (node.right.type === 'ClassExpression' ? '' : '()'), path);
		}
		return null;
	}
	function addExportFact(name, local, exported, from, unit, node) {
		var spec = unitSpecs[unit] || { start: 0 };
		var start = spec.start + Number(node && node.start || 0);
		var end = spec.start + Number(node && node.end || node && node.start || 0);
		var row = {
			name: wireText(name, 'module_strings'),
			local: wireText(local, 'module_strings'),
			exported: wireText(exported, 'module_strings'),
			source: wireText(from, 'module_strings'), unit: unit,
			start: start, end: Math.max(start + 1, end),
		};
		exportRows.push(row);
		return row;
	}
	function visitChildren(node, scopeId, unit, exported) {
		var edges = childEdges(node);
		for (var i = 0; i < edges.length; i++) visit(edges[i].node, scopeId, unit, node, edges[i].key, exported);
	}
	function hasUseStrict(body) {
		if (!body || !Array.isArray(body.body)) return false;
		for (var di = 0; di < body.body.length; di++) {
			var statement = body.body[di];
			if (statement.type !== 'ExpressionStatement' || typeof statement.directive !== 'string') break;
			if (statement.directive === 'use strict') return true;
		}
		return false;
	}
	function visitFunction(node, outerScope, unit, parent, exported) {
		var parameterScope = makeScope('parameters', outerScope, null, unit);
		var functionStrict = !!(scopes[outerScope] && scopes[outerScope].strict) || hasUseStrict(node.body);
		scopes[parameterScope].strict = functionStrict;
		scopes[parameterScope].varOwner = parameterScope;
		if (node.type !== 'ArrowFunctionExpression') {
			if (!scopes[parameterScope].names.arguments) {
				var functionStart = Number((unitSpecs[unit] || { start: 0 }).start || 0) + node.start;
				scopes[parameterScope].names.arguments = [{
					kind: 'implicit', start: functionStart, end: functionStart, unit: unit,
				}];
			}
		}
		if (node.type === 'FunctionExpression' && node.id) bindPattern(node.id, parameterScope, 'function-name', unit);
		for (var i = 0; i < (node.params || []).length; i++) bindPattern(node.params[i], parameterScope, 'parameter', unit);
		if (node.id) nodeScope.set(node.id, node.type === 'FunctionDeclaration' ? outerScope : parameterScope);
		for (var p = 0; p < (node.params || []).length; p++) visit(node.params[p], parameterScope, unit, node, 'params', false);
		var bodyScope = makeScope('function-body', parameterScope, null, unit);
		scopes[bodyScope].strict = functionStrict;
		scopes[bodyScope].varOwner = bodyScope;
		functionBodyDepth += 1;
		try {
			if (node.body && node.body.type === 'BlockStatement') {
				nodeScope.set(node.body, bodyScope);
				for (var b = 0; b < node.body.body.length; b++) visit(node.body.body[b], bodyScope, unit, node.body, 'body', false);
			} else if (node.body) visit(node.body, bodyScope, unit, node, 'body', false);
		} finally { functionBodyDepth -= 1; }
	}
	function visit(node, scopeId, unit, parent, key, exported) {
		if (!node || typeof node.type !== 'string') return;
		nodeScope.set(node, scopeId);
		if (!functionBodyDepth) recordSymbol(node, parent, unit, exported);
		var type = node.type;
		if (type === 'Program') {
			for (var pb = 0; pb < node.body.length; pb++) visit(node.body[pb], scopeId, unit, node, 'body', false);
			return;
		}
		if (type === 'ExportNamedDeclaration' || type === 'ExportDefaultDeclaration' || type === 'ExportAllDeclaration') {
			var from = String((node.source && node.source.value) || '');
			if (type === 'ExportAllDeclaration') {
				var allExported = keyName(node.exported) || '*';
				addExportFact(allExported, '*', allExported, from, unit, node.exported || node);
			}
			for (var es = 0; es < (node.specifiers || []).length; es++) {
				if (!node.source && node.specifiers[es].local) exportReferenceNodes.add(node.specifiers[es].local);
				addExportFact(keyName(node.specifiers[es].exported || node.specifiers[es].local),
					keyName(node.specifiers[es].local), keyName(node.specifiers[es].exported),
					from, unit, node.specifiers[es].exported || node.specifiers[es]);
				visit(node.specifiers[es], scopeId, unit, node, 'specifiers', false);
			}
			if (node.declaration) {
				var exportedNames = [];
				if (node.declaration.id) exportedNames.push(node.declaration.id.name || '');
				else if (type === 'ExportDefaultDeclaration' && node.declaration.type === 'Identifier') {
					exportedNames.push(node.declaration.name || '');
				}
				for (var ed = 0; ed < (node.declaration.declarations || []).length; ed++) {
					var exportedIds = patternIdentifiers(node.declaration.declarations[ed].id);
					for (var en = 0; en < exportedIds.length; en++) exportedNames.push(exportedIds[en].name);
				}
				if (type === 'ExportDefaultDeclaration') {
					addExportFact('default', exportedNames[0] || '', 'default', '', unit,
						node.declaration.id || node.declaration);
				} else {
					for (var exn = 0; exn < exportedNames.length; exn++) {
						if (exportedNames[exn]) addExportFact(exportedNames[exn], exportedNames[exn],
							exportedNames[exn], '', unit, node.declaration.id || node.declaration);
					}
				}
				exportedNodes.add(node.declaration);
				visit(node.declaration, scopeId, unit, node, 'declaration', true);
			} else if (type === 'ExportDefaultDeclaration') {
				addExportFact('default', '', 'default', '', unit, node.declaration || node);
			}
			if (node.source) visit(node.source, scopeId, unit, node, 'source', false);
			return;
		}
		if (type === 'ImportDeclaration') {
			for (var is = 0; is < node.specifiers.length; is++) {
				var local = node.specifiers[is].local;
				if (local) { bindPattern(local, scopeId, 'import', unit); nodeScope.set(local, scopeId); }
			}
			var importSource = String((node.source && node.source.value) || '');
			if (!node.specifiers.length) {
				importRows.push({
					source: wireText(importSource, 'module_strings'), imported: '', local: '', names: [], unit: unit,
				});
			}
			if (node.specifiers.length) {
				for (var si = 0; si < node.specifiers.length; si++) {
					var localNode = node.specifiers[si].local;
					var importedName = keyName(node.specifiers[si].imported) ||
						(node.specifiers[si].type === 'ImportDefaultSpecifier' ? 'default' : '*');
					var localName = localNode && localNode.name || '';
					importRows.push({
						source: wireText(importSource, 'module_strings'),
						imported: wireText(importedName, 'module_strings'),
						local: wireText(localName, 'module_strings'),
						names: localName ? [wireText(localName, 'module_strings')] : [], unit: unit,
					});
					/* Import is named by the module it names. Local binding is what
						 resolution and find address — not what the file's shape says. */
					var importSymbol = addSymbol('import', localNode ? localNode.name : importSource,
						node.specifiers[si], localNode, unit, false, "import '" + importSource + "'");
					if (importSymbol) importSymbol.import = {
						source: wireText(importSource, 'module_strings'),
						imported: wireText(importedName, 'module_strings'),
						local: wireText(localName, 'module_strings'),
					};
				}
			} else {
				var sideEffectImport = addSymbol('import', importSource, node, null, unit, false,
					"import '" + importSource + "'");
				if (sideEffectImport) sideEffectImport.import = {
					source: wireText(importSource, 'module_strings'), imported: '', local: '',
				};
			}
			return;
		}
		if (type === 'FunctionDeclaration') {
			if (node.id) bindPattern(node.id, scopeId, 'function', unit);
			/* Annex B gives a sloppy block function a var-owner binding plus its
				 lexical one. Strict functions/modules keep only the block binding. */
			if (node.id && units[unit] && units[unit].sourceType === 'script' &&
					scopes[scopeId] && scopes[scopeId].strict !== true && varScope(scopeId) !== scopeId) {
				bindPattern(node.id, varScope(scopeId), 'annex-b-function', unit);
			}
			visitFunction(node, scopeId, unit, parent, exported); return;
		}
		if (type === 'FunctionExpression' || type === 'ArrowFunctionExpression') {
			visitFunction(node, scopeId, unit, parent, exported); return;
		}
		if (type === 'ClassDeclaration' || type === 'ClassExpression') {
			if (type === 'ClassDeclaration' && node.id) bindPattern(node.id, scopeId, 'class', unit);
			var classScope = makeScope('class', scopeId, null, unit);
			scopes[classScope].strict = true;
			scopes[classScope].varOwner = varScope(scopeId);
			if (node.id) { bindPattern(node.id, classScope, 'class-name', unit); nodeScope.set(node.id, classScope); }
			/* Named class expression's inner name is already in scope while its
				 heritage is evaluated. Declarations carry the same inner binding (plus
				 their outer one). */
			if (node.superClass) visit(node.superClass, classScope, unit, node, 'superClass', false);
			if (node.body) {
				nodeScope.set(node.body, classScope);
				for (var ce = 0; ce < node.body.body.length; ce++) visit(node.body.body[ce], classScope, unit, node.body, 'body', false);
			}
			return;
		}
		if (type === 'BlockStatement') {
			var blockScope = makeScope('block', scopeId, varScope(scopeId), unit);
			for (var bi = 0; bi < node.body.length; bi++) visit(node.body[bi], blockScope, unit, node, 'body', false);
			return;
		}
		if (type === 'StaticBlock') {
			var staticScope = makeScope('static-block', scopeId, null, unit);
			scopes[staticScope].strict = true;
			scopes[staticScope].varOwner = staticScope;
			for (var sb = 0; sb < node.body.length; sb++) visit(node.body[sb], staticScope, unit, node, 'body', false);
			return;
		}
		if (type === 'ForStatement' || type === 'ForInStatement' || type === 'ForOfStatement') {
			var loopScope = makeScope('loop', scopeId, varScope(scopeId), unit);
			if ((type === 'ForInStatement' || type === 'ForOfStatement') && node.left && node.left.type !== 'VariableDeclaration') {
				markAssignmentTarget(node.left, writeNodes);
			}
			if (node.init) visit(node.init, loopScope, unit, node, 'init', false);
			if (node.left) visit(node.left, loopScope, unit, node, 'left', false);
			/* Loop lexical environment already exists while an in/of RHS evaluates
				 (binding is in TDZ, but resolution still names it). Runtime
				 initialization is not this syntactic index's claim. */
			if (node.right) visit(node.right, loopScope, unit, node, 'right', false);
			if (node.test) visit(node.test, loopScope, unit, node, 'test', false);
			if (node.update) visit(node.update, loopScope, unit, node, 'update', false);
			if (node.body) visit(node.body, loopScope, unit, node, 'body', false);
			return;
		}
		if (type === 'SwitchStatement') {
			visit(node.discriminant, scopeId, unit, node, 'discriminant', false);
			var switchScope = makeScope('switch', scopeId, varScope(scopeId), unit);
			for (var sc = 0; sc < node.cases.length; sc++) visit(node.cases[sc], switchScope, unit, node, 'cases', false);
			return;
		}
		if (type === 'CatchClause') {
			var catchScope = makeScope('catch', scopeId, varScope(scopeId), unit);
			if (node.param) bindPattern(node.param, catchScope, 'catch', unit);
			if (node.param) visit(node.param, catchScope, unit, node, 'param', false);
			if (node.body) {
				var catchBodyScope = makeScope('catch-body', catchScope, varScope(catchScope), unit);
				if (node.param && node.param.type === 'Identifier') {
					scopes[catchBodyScope].suppressedVars = Object.create(null);
					scopes[catchBodyScope].suppressedVars[node.param.name] = true;
				}
				nodeScope.set(node.body, catchBodyScope);
				for (var cb = 0; cb < node.body.body.length; cb++) {
					visit(node.body.body[cb], catchBodyScope, unit, node.body, 'body', false);
				}
			}
			return;
		}
		if (type === 'VariableDeclaration') {
			var targetScope = node.kind === 'var' ? varScope(scopeId) : scopeId;
			for (var vd = 0; vd < node.declarations.length; vd++) {
				if (node.kind !== 'var') {
					bindPattern(node.declarations[vd].id, targetScope, node.kind, unit);
					continue;
				}
				var varNames = patternIdentifiers(node.declarations[vd].id);
				for (var vn = 0; vn < varNames.length; vn++) {
					/* `var e` inside `catch (e)` names the catch binding for the
						 declaration's own syntax, doesn't instantiate an outer var binding.
						 Other names in the same destructuring pattern still bind normally. */
					if (catchVarSuppressed(scopeId, targetScope, varNames[vn].name)) {
						bindingNodes.add(varNames[vn]);
					} else bindPattern(varNames[vn], targetScope, node.kind, unit);
				}
			}
			for (var vv = 0; vv < node.declarations.length; vv++) visit(node.declarations[vv], scopeId, unit, node, 'declarations', exported);
			return;
		}
		if (type === 'AssignmentExpression') {
			markAssignmentTarget(node.left, node.operator === '=' ? writeNodes : readWriteNodes);
		}
		if (type === 'UpdateExpression') {
			markAssignmentTarget(node.argument, readWriteNodes);
		}
		if (type === 'UnaryExpression' && node.operator === 'delete') {
			markAssignmentTarget(node.argument, writeNodes);
		}
		if (type === 'WithStatement') {
			scopes[scopeId].dynamic = true; resolutionComplete = false;
			omission('unresolved', 'with_scope', null, null, false, unit);
		}
		visitChildren(node, scopeId, unit, exported);
	}

	var htmlGlobal = null;
	for (var ai = 0; ai < asts.length; ai++) {
		var parsedUnit = asts[ai];
		var rootScope;
		if (docKind === 'html') {
			if (htmlGlobal == null) {
				htmlGlobal = makeScope('html-global', null, null, parsedUnit.unit);
				if (htmlGlobal != null && scopes[htmlGlobal]) scopes[htmlGlobal].varOwner = htmlGlobal;
			}
			/* Browser modules isolate what they declare, but their Module
				 Environment's outer is the Realm global. Classic declarations are
				 visible to every module (even a deferred module written earlier); a
				 module's declarations never leak to a sibling module or back into
				 classic code. */
			if (parsedUnit.sourceType === 'script') rootScope = htmlGlobal;
			else {
				rootScope = makeScope('module', htmlGlobal, null, parsedUnit.unit);
				if (rootScope != null && scopes[rootScope]) scopes[rootScope].varOwner = rootScope;
			}
		} else {
			rootScope = makeScope(parsedUnit.sourceType === 'module' ? 'module' : 'script', null, null, parsedUnit.unit);
			if (rootScope != null && scopes[rootScope]) scopes[rootScope].varOwner = rootScope;
		}
		/* A request whose aggregate scope budget was consumed by an earlier unit still returns that earlier partial index plus a scope omission — doesn't walk the successor with a null owner and turn an ordinary bound into a dead Worker. */
		if (rootScope == null || !scopes[rootScope]) continue;
		scopes[rootScope].strict = parsedUnit.sourceType === 'module' || hasUseStrict(parsedUnit.ast);
		parsedUnit.rootScope = rootScope;
		if (docKind === 'html') {
			var scriptNode = { start: 0, end: parsedUnit.spec.end - parsedUnit.spec.start, body: { start: Math.min(80, parsedUnit.spec.end - parsedUnit.spec.start) } };
			var scriptSymbol = addSymbol('script', parsedUnit.spec.label, scriptNode, null, parsedUnit.unit, false, parsedUnit.spec.label);
			/* Entry names the element, so its extent is the element. A script whose
				 entire body is one declaration would otherwise share that
				 declaration's span and stop containing it. */
			if (scriptSymbol) {
				scriptSymbol.completeSpan = {
					start: Number(parsedUnit.spec.elementStart), end: Number(parsedUnit.spec.elementEnd),
				};
			}
		}
		visit(parsedUnit.ast, rootScope, parsedUnit.unit, null, '', false);
	}

	// Classic scripts share one Global Environment: across units a lexical declaration conflicts with any repeat; only var/function may repeat.
	if (docKind === 'html' && htmlGlobal != null && scopes[htmlGlobal]) {
		var globalNames = scopes[htmlGlobal].names;
		var lexicalKinds = { let: 1, const: 1, class: 1 };
		var conflict = null;
		for (var globalName in globalNames) {
			var records = (globalNames[globalName] || []).slice().sort(function (left, right) {
				return left.unit - right.unit || left.start - right.start;
			});
			var priorUnits = Object.create(null);
			var priorLexical = false;
			for (var gr = 0; gr < records.length; gr++) {
				var binding = records[gr];
				if (!units[binding.unit] || units[binding.unit].sourceType !== 'script') continue;
				var seenOtherUnit = Object.keys(priorUnits).some(function (key) {
					return Number(key) !== Number(binding.unit);
				});
				var lexical = lexicalKinds[binding.kind] === 1;
				if (seenOtherUnit && (lexical || priorLexical)) {
					conflict = { name: globalName, binding: binding };
					break;
				}
				priorUnits[binding.unit] = true;
				if (lexical) priorLexical = true;
			}
			if (conflict) break;
		}
		if (conflict) {
			var conflictPos = Number(conflict.binding.start || 0);
			var conflictLoc = locationAt(conflictPos);
			var conflictMessage = "Identifier '" + conflict.name + "' has already been declared";
			var conflictUnit = units[conflict.binding.unit];
			conflictUnit.status = 'syntax_error'; conflictUnit.message = conflictMessage;
			conflictUnit.pos = conflictPos; conflictUnit.line = conflictLoc.line;
			conflictUnit.column = conflictLoc.column; conflictUnit.sourceType = 'script';
			if (!firstSyntax) firstSyntax = {
				status: 'syntax_error', message: conflictMessage, pos: conflictPos,
				line: conflictLoc.line, column: conflictLoc.column, sourceType: 'script',
			};
		}
	}

	/* Parentage derived from exact complete spans after the single symbol table closes. Equal spans (destructured siblings) remain siblings; only strict containment can parent. */
	symbols.sort(function (a, b) {
		return a.completeSpan.start - b.completeSpan.start || b.completeSpan.end - a.completeSpan.end || a.ordinal - b.ordinal;
	});
	var symbolStack = [];
	for (var sy = 0; sy < symbols.length; sy++) {
		var symbol = symbols[sy];
		while (symbolStack.length) {
			var candidate = symbols[symbolStack[symbolStack.length - 1]];
			var strict = candidate.completeSpan.start <= symbol.completeSpan.start &&
				candidate.completeSpan.end >= symbol.completeSpan.end &&
				(candidate.completeSpan.start < symbol.completeSpan.start || candidate.completeSpan.end > symbol.completeSpan.end);
			if (strict) break;
			symbolStack.pop();
		}
		symbol.parent = symbolStack.length ? symbolStack[symbolStack.length - 1] : null;
		symbol.depth = symbol.parent == null ? 0 : symbols[symbol.parent].depth + 1;
		var parentName = symbol.parent == null ? '' : symbols[symbol.parent].qualifiedName;
		if (!symbol.qualifiedName) symbol.qualifiedName = wireText(parentName ? parentName + '.' + symbol.name : symbol.name, 'symbol_strings');
		symbol.ordinal = sy;
		symbolStack.push(sy);
	}
	for (var sx = 0; sx < exportRows.length; sx++) {
		var exportFact = exportRows[sx];
		var exportAst = null;
		for (var ea = 0; ea < asts.length; ea++) {
			if (asts[ea].unit === exportFact.unit) { exportAst = asts[ea]; break; }
		}
		var exportRoot = exportAst && scopes[exportAst.rootScope];
		var bindingRecords = exportRoot && exportFact.local && exportFact.local !== '*'
			? (exportRoot.names[exportFact.local] || []) : [];
		for (var sm = 0; sm < symbols.length; sm++) {
			var exportedSymbol = symbols[sm];
			var bindingBacked = exportedSymbol.nameSpan && bindingRecords.some(function (binding) {
				return binding.unit === exportFact.unit &&
					binding.start === exportedSymbol.nameSpan.start &&
					binding.end === exportedSymbol.nameSpan.end;
			});
			if (exportedSymbol.unit === exportFact.unit && bindingBacked) {
				exportedSymbol.exported = true;
				exportedSymbol.export = {
					source: wireText(exportFact.source, 'module_strings'),
					local: wireText(exportFact.local, 'module_strings'),
					exported: wireText(exportFact.exported, 'module_strings'),
				};
			}
		}
	}

	var STANDARD = Object.create(null);
	('globalThis Infinity NaN undefined eval isFinite isNaN parseFloat parseInt decodeURI decodeURIComponent ' +
	 'encodeURI encodeURIComponent Object Function Boolean Symbol Error AggregateError EvalError RangeError ' +
	 'ReferenceError SuppressedError SyntaxError TypeError URIError Number BigInt Math Date String RegExp Array ' +
	 'Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array BigInt64Array ' +
	 'BigUint64Array Float32Array Float64Array Map Set WeakMap WeakSet ArrayBuffer SharedArrayBuffer DataView ' +
	 'Atomics JSON WeakRef FinalizationRegistry Iterator Promise Reflect Proxy Intl WebAssembly').split(' ').forEach(function (name) { STANDARD[name] = 1; });
	var BROWSER = Object.create(null);
	('self window document console setTimeout clearTimeout setInterval clearInterval queueMicrotask ' +
	 'requestAnimationFrame cancelAnimationFrame requestIdleCallback cancelIdleCallback structuredClone fetch ' +
	 'Headers Request Response URL URLSearchParams Blob File FileReader FormData AbortController AbortSignal ' +
	 'Worker MessageChannel MessagePort BroadcastChannel EventTarget Event CustomEvent Element Node HTMLElement ' +
	 'DocumentFragment Range Selection MutationObserver ResizeObserver IntersectionObserver localStorage ' +
	 'sessionStorage indexedDB IDBKeyRange crypto navigator location history screen performance atob btoa ' +
	 'TextEncoder TextDecoder DOMParser XMLSerializer XMLHttpRequest WebSocket Notification CSS CSSStyleSheet ' +
	 'customElements ' +
	 'getComputedStyle matchMedia alert confirm prompt CanvasRenderingContext2D Image Audio Option ImageData ' +
	 'OffscreenCanvas caches ReadableStream WritableStream TransformStream CompressionStream DecompressionStream ' +
	 'SVGElement Text Comment Attr NodeList HTMLCollection name close open print scroll scrollTo scrollBy focus ' +
	 'blur postMessage addEventListener removeEventListener dispatchEvent top parent frames status length origin ' +
	 'isSecureContext Document ShadowRoot DOMException HTMLDocument ClipboardItem MediaQueryList VisualViewport ' +
	 'Window Navigator Screen History Location StorageEvent PromiseRejectionEvent CompositionEvent InputEvent ' +
	 'KeyboardEvent MouseEvent PointerEvent TouchEvent WheelEvent DragEvent FocusEvent NodeFilter NodeIterator ' +
	 'TreeWalker Highlight scheduler createImageBitmap ImageBitmap MutationRecord ResizeObserverSize ' +
	 'IntersectionObserverEntry PerformanceObserver escape unescape').split(' ').forEach(function (name) { BROWSER[name] = 1; });
	var CJS = Object.create(null);
	('console setTimeout clearTimeout setInterval clearInterval queueMicrotask structuredClone URL URLSearchParams ' +
	 'TextEncoder TextDecoder AbortController AbortSignal module exports require arguments process global __dirname __filename ' +
	 'Buffer setImmediate clearImmediate').split(' ').forEach(function (name) { CJS[name] = 1; });
	var supplied = Object.create(null);
	for (var gx = 0; gx < ((request && request.globals) || []).length; gx++) supplied[String(request.globals[gx])] = 1;
	function indexedBinding(scopeId, name) {
		var cursor = scopeId;
		while (cursor != null && scopes[cursor]) {
			if (scopes[cursor].names[name]) return scopes[cursor].names[name][0] || null;
			cursor = scopes[cursor].parent;
		}
		return null;
	}
	function resolves(scopeId, name, host) {
		if (indexedBinding(scopeId, name)) return true;
		return !!(STANDARD[name] || supplied[name] || (host === 'browser' && BROWSER[name]) || (host === 'node-cjs' && CJS[name]));
	}
	function identifierRole(node, parent, key) {
		if (bindingNodes.has(node)) return 'binding';
		if (writeNodes.has(node)) return 'write';
		if (readWriteNodes.has(node)) return 'readwrite';
		if (exportReferenceNodes.has(node)) return 'read';
		if (!parent) return 'read';
		if ((parent.type === 'MemberExpression' || parent.type === 'Property' ||
				parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') &&
				key === 'property' && !parent.computed) return 'property';
		if (parent.type === 'MemberExpression' && key === 'property' && !parent.computed) return 'property';
		if (parent.type === 'Property' && key === 'key' && !parent.computed) {
			return parent.shorthand && parent.value === node ? 'read' : 'property';
		}
		if ((parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && key === 'key' && !parent.computed) return 'property';
		if (key === 'label' || parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return 'label';
		if (parent.type === 'MetaProperty') return 'meta';
		if (parent.type.indexOf('Import') === 0) return key === 'local' ? 'binding' : 'imported';
		if (parent.type === 'ExportSpecifier' ||
				(parent.type === 'ExportAllDeclaration' && key === 'exported')) return 'exported';
		return 'read';
	}
	function occurrence(kind, name, node, base, unit, scopeId, role, container) {
		occurrenceObserved += 1;
		used.occurrences = Math.min(occurrenceObserved, LIMIT.occurrences);
		if (occurrenceObserved > LIMIT.occurrences) { bounded = true; return null; }
		var row = {
			kind: kind, name: wireText(name, 'occurrence_strings'), role: role || '',
			start: base + Number(node.start || 0), end: base + Number(node.end || node.start || 0),
			unit: unit, scope: scopeId, container: wireText(container || '', 'occurrence_strings'),
		};
		occurrenceRows.push(row); return row;
	}
	var identifierSeen = new WeakSet();
	for (var oi = 0; oi < asts.length; oi++) {
		var occUnit = asts[oi];
		var base = occUnit.spec.start;
		var host = occUnit.spec.host;
		var stack = [{ node: occUnit.ast, parent: null, key: '' }];
		while (stack.length) {
			var frame = stack.pop();
			var node = frame.node;
			var scopeId = nodeScope.get(node);
			if (node.type === 'Identifier' && !identifierSeen.has(node)) {
				identifierSeen.add(node);
				var role = identifierRole(node, frame.parent, frame.key);
				if (role === 'read' || role === 'write' || role === 'readwrite') {
					occurrence('identifier', node.name, node, base, occUnit.unit, scopeId, role, '');
					if (resolutionComplete && !resolves(scopeId, node.name, host)) {
						unresolvedObserved += 1;
						if (unresolvedRows.length < 4096) {
							var idLoc = locationAt(base + node.start);
							unresolvedRows.push({ name: wireText(node.name, 'unresolved_strings'), start: base + node.start, line: idLoc.line, column: idLoc.column, role: role });
						}
					}
				}
			}
			if (node.type === 'CallExpression' || node.type === 'NewExpression') {
				var callName = node.callee && node.callee.type === 'MemberExpression'
					? memberPath(node.callee, base) || keyName(node.callee.property, node.callee.computed, base) : keyName(node.callee);
				if (callName) occurrence(node.type === 'NewExpression' ? 'construct' : 'call', callName, node, base, occUnit.unit, scopeId, 'read', '');
				if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Identifier' &&
						node.callee.name === 'eval' && node.optional !== true) {
					resolutionComplete = false;
					omission('unresolved', 'direct_eval', null, null, false, occUnit.unit);
				}
			}
			if (node.type === 'MemberExpression') {
				var path = memberPath(node, base);
				var memberName = path || keyName(node.property, node.computed, base);
				var memberRole = writeNodes.has(node) ? 'write' : readWriteNodes.has(node) ? 'readwrite' : 'read';
				if (memberName) occurrence('member', memberName, node, base, occUnit.unit, scopeId,
					memberRole, '');
			}
			var edges = childEdges(node);
			for (var eo = edges.length - 1; eo >= 0; eo--) stack.push({ node: edges[eo].node, parent: node, key: edges[eo].key });
		}
	}
	if (!resolutionComplete) unresolvedRows.length = 0;
	if (resolutionComplete && unresolvedObserved > unresolvedRows.length) {
		bounded = true;
		omission('unresolved', 'unresolved_budget', unresolvedObserved, unresolvedRows.length, true, null);
	}
	if (declarationObserved > LIMIT.declarations) {
		omission('declarations', 'declaration_budget', declarationObserved,
			Math.min(declarationObserved, LIMIT.declarations), true, null);
	}
	if (occurrenceObserved > LIMIT.occurrences) omission('occurrences', 'occurrence_budget', occurrenceObserved, LIMIT.occurrences, true, null);

	var entries = symbols.slice(0, LIMIT.entries).map(function (row) {
		return {
			level: Math.min(64, row.depth), kind: row.kind, name: row.name, label: row.label,
			container: row.parent == null ? '' : symbols[row.parent].qualifiedName, exported: row.exported,
			unit: row.unit, start: row.headerSpan.start, end: row.headerSpan.end,
			extentEnd: row.completeSpan.end, ordinal: row.ordinal,
		};
	});
	used.entries = entries.length;
	if (symbols.length > LIMIT.entries || symbolObserved > symbols.length) {
		var entryObserved = symbolObserved;
		bounded = true;
		omission('entries', 'entry_budget', entryObserved, entries.length, true, null);
	}

	/* A reference's witness, not its former ordinal, chooses the scope —
		 Worker-side twin of `_rapierOutlineRelocate`: private ticket proof
		 crosses with the request, captured source supplies fresh candidates,
		 zero or two matches withdraw rather than letting position guess. Once
		 resolved, find and packet projection spend the one index's occurrence
		 table before it's discarded. */
	var targetResolution = null;
	var target = request && request.target;
	var targetWitness = target && target.witness;
	if (!within && targetWitness) {
		var targetIntegrities = entries.map(function (entry) {
			return outlineIntegrity(source.slice(entry.start, entry.end));
		});
		var targetMarks = entries.map(function (entry, index) {
			return entry.level + ':' + targetIntegrities[index].fnv;
		});
		var targetFound = -1;
		var targetAmbiguous = false;
		for (var ti = 0; ti < entries.length; ti++) {
			var targetEntry = entries[ti];
			var candidateMatches = Number(targetEntry.level) === Number(targetWitness.level) &&
				sameIntegrity(targetWitness.labelIntegrity, outlineIntegrity(targetEntry.label)) &&
				sameIntegrity(targetWitness.integrity, targetIntegrities[ti]) &&
				String(targetWitness.previous || '') === (ti > 0 ? targetMarks[ti - 1] : '') &&
				String(targetWitness.following || '') === (ti + 1 < entries.length ? targetMarks[ti + 1] : '');
			if (!candidateMatches) continue;
			if (targetFound >= 0) { targetAmbiguous = true; targetFound = -1; break; }
			targetFound = ti;
		}
		if (targetFound >= 0) {
			within = { start: entries[targetFound].start, end: entries[targetFound].extentEnd };
			targetResolution = { status: 'resolved', index: targetFound,
				start: within.start, end: within.end };
		} else {
			targetResolution = { status: targetAmbiguous ? 'ambiguous' : 'not_found', index: -1 };
			/* Unresolved target is an empty scope, never permission to answer from
				 the whole document. Main realm returns the ticket's canonical error
				 vocabulary. */
			within = { start: 1, end: 0 };
		}
	}

	var lo = within ? Number(within.start) : -Infinity;
	var hi = within ? Number(within.end) : Infinity;
	function inScope(row) { return row.start >= lo && row.end <= hi; }
	function wants(kind) { return !wanted || wanted.indexOf(kind) >= 0; }
	function nameMatches(name) { return !!query && (name === query || String(name).indexOf(query) >= 0); }
	var matchCandidates = [];
	if (wants('declaration')) {
		for (var ds = 0; ds < symbols.length; ds++) {
			var declaration = symbols[ds];
			if (nameMatches(declaration.name) || nameMatches(declaration.qualifiedName)) {
				/* Caller asking where something is declared asks for the declaration,
					 not the name token inside it. Complete syntactic unit is the answer. */
				var declarationRow = { kind: 'declaration', name: declaration.name,
					start: declaration.completeSpan.start, end: declaration.completeSpan.end,
					container: declaration.parent == null ? '' : symbols[declaration.parent].qualifiedName, unit: declaration.unit };
				if (inScope(declarationRow)) matchCandidates.push(declarationRow);
			}
		}
	}
	for (var mo = 0; mo < occurrenceRows.length; mo++) {
		var occ = occurrenceRows[mo];
		var findKinds = [occ.kind];
		if (occ.kind === 'identifier') {
			if (occ.role === 'read') findKinds = ['reference'];
			else if (occ.role === 'write') findKinds = ['write'];
			else if (occ.role === 'readwrite') findKinds = ['reference', 'write'];
			else continue;
		} else if (occ.kind === 'member') {
			findKinds = ['member'];
			if (occ.role === 'write' || occ.role === 'readwrite') findKinds.push('write');
		}
		for (var fk = 0; fk < findKinds.length; fk++) {
			if (wants(findKinds[fk]) && nameMatches(occ.name) && inScope(occ)) {
				matchCandidates.push({ kind: findKinds[fk], name: occ.name, start: occ.start, end: occ.end,
					container: occ.container, unit: occ.unit });
			}
		}
	}
	if (wants('import')) for (var mi = 0; mi < importRows.length; mi++) {
		if (nameMatches(importRows[mi].source) || nameMatches(importRows[mi].imported) ||
				nameMatches(importRows[mi].local)) {
			var importSymbolRow = symbols.find(function (s) {
				return s.kind === 'import' && s.unit === importRows[mi].unit && s.import &&
					s.import.source === importRows[mi].source && s.import.imported === importRows[mi].imported &&
					s.import.local === importRows[mi].local;
			});
			if (importSymbolRow) matchCandidates.push({ kind: 'import', name: importRows[mi].source,
				start: importSymbolRow.headerSpan.start, end: importSymbolRow.headerSpan.end, container: '', unit: importRows[mi].unit });
		}
	}
	if (wants('export')) for (var me = 0; me < exportRows.length; me++) {
		if (nameMatches(exportRows[me].name) || nameMatches(exportRows[me].source)) {
			matchCandidates.push({ kind: 'export', name: exportRows[me].name,
				start: exportRows[me].start, end: exportRows[me].end,
				container: '', unit: exportRows[me].unit });
		}
	}
	matchCandidates.sort(function (a, b) { return a.start - b.start || a.end - b.end; });
	var matchPageLimit = Math.min(LIMIT.matches,
		requestedMatchLimit > 0 ? requestedMatchLimit : LIMIT.matches);
	var matches = matchCandidates.slice(requestedMatchOffset, requestedMatchOffset + matchPageLimit);
	used.matches = matches.length;
	if (matchCandidates.length > matches.length) {
		bounded = true;
		omission('matches', 'match_budget', matchCandidates.length, matches.length, true, null);
	}

	var packetCalls = [];
	var packetWrites = [];
	var packetImportSources = [];
	function addUnique(list, value) { if (value && list.indexOf(value) < 0) list.push(value); }
	for (var po = 0; po < occurrenceRows.length; po++) {
		var packetRow = occurrenceRows[po];
		if (!inScope(packetRow)) continue;
		if (packetRow.kind === 'call' || packetRow.kind === 'construct') addUnique(packetCalls, packetRow.name);
		if ((packetRow.kind === 'identifier' || packetRow.kind === 'member') &&
				(packetRow.role === 'write' || packetRow.role === 'readwrite')) addUnique(packetWrites, packetRow.name);
		if (packetRow.kind === 'identifier' &&
				(packetRow.role === 'read' || packetRow.role === 'write' || packetRow.role === 'readwrite')) {
			var packetBinding = indexedBinding(packetRow.scope, packetRow.name);
			if (packetBinding && packetBinding.kind === 'import') {
				for (var pif = 0; pif < importRows.length; pif++) {
					if (importRows[pif].unit === packetBinding.unit &&
							importRows[pif].local === packetRow.name) addUnique(packetImportSources, importRows[pif].source);
				}
			}
		}
	}
	var chain = [];
	if (mode === 'enclosing') {
		var at = (request && request.at) || { start: 0, end: 0 };
		var atStart = Number(at.start || 0), atEnd = Number(at.end || 0);
		for (var ca = 0; ca < asts.length; ca++) {
			var cbase = asts[ca].spec.start;
			var cstack = [asts[ca].ast];
			while (cstack.length) {
				var cnode = cstack.pop();
				var cstart = cbase + cnode.start, cend = cbase + cnode.end;
				if (cstart <= atStart && cend >= atEnd) {
					var ckind = cnode.type === 'Program' ? 'module'
						: cnode.type.indexOf('Class') === 0 ? 'class'
						: (cnode.type.indexOf('Function') === 0 || cnode.type === 'ArrowFunctionExpression' || cnode.type === 'MethodDefinition') ? 'function'
						: (cnode.type === 'BlockStatement' || cnode.type === 'StaticBlock' || cnode.type === 'ClassBody') ? 'block'
						: /(?:Statement|Declaration|Declarator)$/.test(cnode.type) ? 'statement' : 'expression';
					chain.push({ start: cstart, end: cend, kind: ckind });
					var cedges = childEdges(cnode);
					for (var ci = 0; ci < cedges.length; ci++) cstack.push(cedges[ci].node);
				}
			}
		}
		chain.sort(function (a, b) { return (a.end - a.start) - (b.end - b.start) || a.start - b.start; });
		var uniqueChain = [];
		for (var uc = 0; uc < chain.length && uniqueChain.length < 32; uc++) {
			var prior = uniqueChain[uniqueChain.length - 1];
			if (!prior || prior.start !== chain[uc].start || prior.end !== chain[uc].end) uniqueChain.push(chain[uc]);
		}
		chain = uniqueChain;
	}

	var status = 'ok';
	if (firstSyntax) status = firstSyntax.status === 'unavailable' ? 'unavailable' : 'syntax_error';
	else if (firstBound || bounded || omissions.some(function (row) { return row.reason !== 'external_bytes'; })) status = 'bounded';
	else if (omissions.some(function (row) { return row.reason === 'external_bytes'; })) status = 'partial';
	var complete = status === 'ok' && omissions.length === 0 && resolutionComplete;
	var parse = firstSyntax ? {
		status: firstSyntax.status === 'unavailable' ? 'unavailable' : 'failed',
		sourceType: firstSyntax.sourceType || '', message: firstSyntax.message || '',
		pos: Number(firstSyntax.pos == null ? -1 : firstSyntax.pos),
		line: Number(firstSyntax.line || 0), column: Number(firstSyntax.column || 0),
	} : {
		/* Syntax is still OK when a semantic budget bounded the answer.
			 StructuralIndex status and ledger carry that bound; relabelling it
			 parse failure would erase which resource actually ran out. */
		status: 'ok', sourceType: units.length === 1 ? units[0].sourceType : '',
		message: firstBound ? firstBound.message : '', pos: -1, line: 0, column: 0,
	};
	var declarationRows = symbols.filter(function (row) { return row.kind !== 'script'; }).map(function (row) {
		return {
			kind: row.kind, name: row.name,
			declarationKind: row.declarationKind || row.kind,
			container: row.parent == null ? '' : symbols[row.parent].qualifiedName,
			exported: row.exported, unit: row.unit,
			start: row.completeSpan.start, end: row.completeSpan.end,
			nameStart: row.nameSpan ? row.nameSpan.start : row.headerSpan.start,
			hash: row.hash,
		};
	});
	var packet = null;
	if (targetWitness && targetResolution && targetResolution.status === 'resolved') {
		var selectedPacketCalls = packetCalls.slice(0, 12);
		var selectedPacketWrites = packetWrites.slice(0, 12);
		var packetImports = packetImportSources.slice();
		var packetCallsOut = selectedPacketCalls.map(function (value) { return String(value).slice(0, 128); });
		var packetWritesOut = selectedPacketWrites.map(function (value) { return String(value).slice(0, 128); });
		var packetImportsOut = packetImports.slice(0, 8).map(function (value) { return String(value).slice(0, 256); });
		var packetOmitted = Math.max(0, packetCalls.length - packetCallsOut.length) +
			Math.max(0, packetWrites.length - packetWritesOut.length) +
			Math.max(0, packetImports.length - packetImportsOut.length);
		selectedPacketCalls.forEach(function (value) { packetOmitted += Math.max(0, String(value).length - 128); });
		selectedPacketWrites.forEach(function (value) { packetOmitted += Math.max(0, String(value).length - 128); });
		packetImports.slice(0, 8).forEach(function (value) { packetOmitted += Math.max(0, String(value).length - 256); });
		packet = {};
		if (packetCallsOut.length) packet.calls = packetCallsOut;
		if (packetWritesOut.length) packet.writes = packetWritesOut;
		if (packetImportsOut.length) packet.imports_used = packetImportsOut;
		if (packetOmitted) packet.omitted = packetOmitted;
		if (!complete || packetOmitted) packet.truncated = true;
	}
	var result = {
		ok: status !== 'syntax_error' && status !== 'unavailable',
		engine: 'acorn@8.18.0', kind: docKind, mode: mode, chars: source.length,
		identity: request && request.identity || null,
		status: status, complete: complete, omissions: omissions,
		budget: { limits: LIMIT, used: used }, units: units,
		target: targetResolution,
		truncated: !complete,
		parse: parse, bounds: { nodes: used.nodes, depth: used.depth },
	};
	/* StructuralIndex is singular INSIDE this job. Transport projection is
		 deliberately question-shaped: shipping 140,000 occurrences for a
		 2,048-row outline would hit the byte gate, erase the useful bounded
		 answer. No projection can upgrade the shared ledger; every fact it
		 returns came from the same index before that index died. */
	if (mode === 'outline') {
		result.entries = entries;
		if (packet) result.packet = packet;
	} else if (mode === 'find') {
		result.entries = entries;
		result.matches = matches;
		result.counted = matchCandidates.length;
		result.matchOffset = requestedMatchOffset;
		result.remaining = Math.max(0, matchCandidates.length - requestedMatchOffset - matches.length);
		result.windowed = true;
		result.overflow = result.remaining > 0;
	} else if (mode === 'enclosing') {
		result.chain = chain;
	} else if (mode === 'facts' || mode === 'audit') {
		result.declarations = declarationRows;
		result.imports = importRows;
		result.exports = exportRows;
		result.unresolved = unresolvedRows;
	} else {
		result.symbols = symbols;
		result.scopes = scopes.map(function (scope) {
			var bindings = [];
			Object.keys(scope.names).forEach(function (name) {
				(scope.names[name] || []).forEach(function (binding) {
					bindings.push({
						name: name, kind: binding.kind,
						start: binding.start, end: binding.end, unit: binding.unit,
					});
				});
			});
			bindings.sort(function (left, right) {
				var positionOrder = left.start - right.start || left.end - right.end;
				if (positionOrder) return positionOrder;
				if (left.name !== right.name) return left.name < right.name ? -1 : 1;
				return left.kind === right.kind ? 0 : left.kind < right.kind ? -1 : 1;
			});
			return {
				id: scope.id, kind: scope.kind, parent: scope.parent, unit: scope.unit,
				dynamic: scope.dynamic === true, bindings: bindings,
			};
		});
		result.occurrences = occurrenceRows;
		result.entries = entries;
		result.matches = matches;
		result.counted = matchCandidates.length;
		result.matchOffset = requestedMatchOffset;
		result.remaining = Math.max(0, matchCandidates.length - requestedMatchOffset - matches.length);
		result.windowed = true;
		result.overflow = result.remaining > 0;
		result.declarations = declarationRows;
		result.imports = importRows;
		result.exports = exportRows;
		result.unresolved = unresolvedRows;
		result.calls = packetCalls;
		result.writes = packetWrites;
		result.chain = chain;
	}
	return result;
}

/* Worker realm is conjured from this artifact itself — acorn bytes already inside the page, handed to a Blob URL — nothing is ever fetched, no second file ships. */
export { _rapierStructureAnalyze as analyzeStructure };
export function analyzeDocument(input) {
  input.signal?.throwIfAborted();
  const request = structureRequest(input);
  if (!request) return {ok: false, complete: false, status: 'unavailable', reason: 'structure_unavailable'};
  const result = _rapierStructureAnalyze(request);
  input.signal?.throwIfAborted();
  return result;
}
