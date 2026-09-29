import {frontMatterFrame, frontMatterLine as lineAt} from '../spec/frontmatter.mjs';

// Values are projections; edits splice owned spans, never reprint a document.
const records = new WeakMap();
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const ESCAPES = {'0': '\0', a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\u0085', _: '\u00a0', L: '\u2028', P: '\u2029'};

function quoted(s) {
	const quote = s[0];
	let value = '';
	for (let i = 1; i < s.length; i++) {
		const c = s[i];
		if (c === quote) {
			if (quote === "'" && s[i + 1] === "'") { value += "'"; i++; continue; }
			return {value, end: i + 1};
		}
		if (c !== '\\' || quote === "'") { value += c; continue; }
		const esc = s[++i];
		if (Object.hasOwn(ESCAPES, esc)) { value += ESCAPES[esc]; continue; }
		const size = esc === 'x' ? 2 : esc === 'u' ? 4 : esc === 'U' ? 8 : 0;
		const hex = s.slice(i + 1, i + 1 + size);
		if (!size || hex.length !== size || !/^[0-9a-f]+$/i.test(hex)) return null;
		const cp = parseInt(hex, 16);
		if (cp > 0x10ffff) return null;
		value += String.fromCodePoint(cp); i += size;
	}
	return null;
}

function scalar(s) {
	s = s.trim();
	if (s.includes('\t') || /[\r\n]/.test(s)) return undefined;
	if (s[0] === '"' || s[0] === "'") {
		const q = quoted(s);
		return q && q.end === s.length && q.value.isWellFormed() ? q.value : undefined;
	}
	if (!s || /^(?:null|~)$/i.test(s)) return null;
	if (/^(?:true|false)$/i.test(s)) return s.toLowerCase() === 'true';
	if (NUMBER.test(s)) {
		const n = Number(s);
		return Number.isFinite(n) && (!Number.isInteger(n) || Number.isSafeInteger(n)) ? n : undefined;
	}
	if (/^[\[\]{}&*!|>%@`"']|^(?:[-?:])(?:\s|$)|:\s|:$|\s#/.test(s) || /[\x00-\x1f]/.test(s)) return undefined;
	return s;
}

// A comment starts only outside a quoted token; apostrophes inside plain words are literal.
function commentAt(s) {
	let token = true, flow = false;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (token && (c === '"' || c === "'")) {
			const q = quoted(s.slice(i));
			if (!q) return s.length;
			i += q.end - 1; token = false; continue;
		}
		if (c === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) return i;
		if (c === '[' && token) { flow = true; continue; }
		if (c === ',' && flow) { token = true; continue; }
		if (c !== ' ') token = false;
	}
	return s.length;
}

function valueOf(s) {
	if (s[0] !== '[') return scalar(s);
	if (s.at(-1) !== ']' || s.includes('\t')) return undefined;
	const inside = s.slice(1, -1), out = [];
	let start = 0, i = 0;
	while (i < inside.length) {
		while (inside[i] === ' ') i++;
		if (i >= inside.length) break;
		start = i;
		if (inside[i] === '"' || inside[i] === "'") {
			const q = quoted(inside.slice(i));
			if (!q) return undefined;
			i += q.end;
			while (inside[i] === ' ') i++;
			if (i < inside.length && inside[i] !== ',') return undefined;
		} else {
			while (i < inside.length && inside[i] !== ',') i++;
		}
		const token = inside.slice(start, i).trim();
		if (!token || (!/^['"]/.test(token) && /[\[\]{}]/.test(token)) || commentAt(token) !== token.length) return undefined;
		const value = scalar(token);
		if (value === undefined) return undefined;
		out.push(value); i++;
	}
	return out;
}

function header(line) {
	const s = line.text;
	if (!s || /^[ \t#]/.test(s)) return null;
	let key, colon;
	if (s[0] === '"' || s[0] === "'") {
		const q = quoted(s);
		if (!q) return null;
		key = q.value; colon = q.end;
		while (s[colon] === ' ') colon++;
	} else {
		colon = s.indexOf(':');
		key = s.slice(0, colon).trimEnd();
		if (colon < 0 || /^[\[\]{}&*!|>%@`]|^[?:-](?:\s|$)/.test(key)) return null;
	}
	if (!key || /[\r\n\t]/.test(key) || s[colon] !== ':' || s[colon + 1] && !/[ \t]/.test(s[colon + 1])) return null;
	let start = colon + 1;
	while (s[start] === ' ') start++;
	const suffix = commentAt(s.slice(start)) + start;
	let end = suffix;
	while (end > start && s[end - 1] === ' ') end--;
	return {key, start: line.start + start, end: line.start + end, comment: suffix < s.length ? line.start + suffix : null, token: s.slice(start, end), line};
}

function itemOf(line) {
	const m = /^( *)- +(.*)$/.exec(line.text);
	if (!m) return null;
	const start = line.start + line.text.length - m[2].length;
	const comment = commentAt(m[2]) + start;
	let end = comment;
	while (end > start && line.text[end - line.start - 1] === ' ') end--;
	const value = scalar(line.text.slice(start - line.start, end - line.start));
	return {line, start, end, comment: comment < line.end ? comment : null, value, indent: m[1]};
}

const trivia = line => /^ *(?:#.*)?$/.test(line.text);
function fieldValue(h, rows) {
	const content = rows.filter(line => !trivia(line));
	if (h.line.text.includes('\t')) return {value: undefined, items: []};
	if (!h.token && content.length) {
		const items = content.map(itemOf);
		if (items.some(i => !i || i.value === undefined) || items.some(i => i.indent !== items[0].indent)) return {value: undefined, items: []};
		return {value: items.map(i => i.value), items};
	}
	return {value: content.length ? undefined : valueOf(h.token), items: []};
}

export function parseFrontMatter(text) {
	if (typeof text !== 'string') throw new TypeError('Front matter needs text');
	const {bom, opening, closing} = frontMatterFrame(text);
	const parsed = {present: false, eol: (text.match(/\r\n|\r|\n/) || ['\n'])[0], bom, block: '', body: text, fields: []};
	const state = {text, opening, closing, spans: [], uncertain: false};
	const finish = () => {
		for (const field of parsed.fields) { if (Array.isArray(field.value)) Object.freeze(field.value); Object.freeze(field); }
		Object.freeze(parsed.fields); return Object.freeze(parsed);
	};
	records.set(parsed, state);
	if (!closing) return finish();
	const rows = [];
	for (let at = opening.next; at < closing.start;) {
		const line = lineAt(text, at); rows.push(line); at = line.next;
	}
	parsed.present = true; parsed.eol = opening.eol;
	parsed.block = text.slice(bom.length, state.closing.next);
	parsed.body = text.slice(state.closing.next);
	for (let i = 0; i < rows.length;) {
		const first = rows[i], h = header(first);
		if (!h && !trivia(first)) state.uncertain = true;
		let end = i + 1;
		// An unfinished quoted/flow value cannot lend edit authority to a later apparent key.
		const unfinished = h && ((/^['"]/.test(h.token) && !quoted(h.token)) || (/^[\[{]/.test(h.token) && !/[\]}]$/.test(h.token)));
		if (unfinished) { end = rows.length; state.uncertain = true; }
		else while (end < rows.length && !header(rows[end]) && (trivia(rows[end]) || /^[ \t-]/.test(rows[end].text))) end++;
		const tail = rows.slice(i + 1, end);
		const result = h && !unfinished ? fieldValue(h, tail) : {value: undefined, items: []};
		const field = {key: h ? h.key : undefined, value: result.value, raw: text.slice(first.start, rows[end - 1].next)};
		parsed.fields.push(field);
		state.spans.push({field, h, rows: rows.slice(i, end), items: result.items});
		i = end;
	}
	return finish();
}

function same(a, b) {
	return Object.is(a, b) || Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

function emitScalar(value) {
	if (value === null) return 'null';
	if (typeof value === 'boolean') return String(value);
	if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)))
		return Object.is(value, -0) ? '-0.0' : String(value).replace(/^(-?\d+)e([+-]\d+)$/, '$1.0e$2');
	if (typeof value !== 'string' || !value.isWellFormed()) throw new TypeError('Use text, a finite safe number, a checkbox, null or a flat list');
	// Quote anything whose YAML type could change in another reader (numbers, dates, timestamps, sexagesimal). Unchanged spellings survive a save.
	if (value && value.trim() === value && !/[\x00-\x1f\x7f-\x9f\[\]{},#\u2028\u2029]/.test(value) && !/^(?:yes$|no$|on$|off$|y$|n$|[-+]?(?:\d|\.))/i.test(value) && scalar(value) === value) return value;
	return JSON.stringify(value).replace(/[\u0085\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function emit(value) {
	return Array.isArray(value) ? '[' + Array.from(value, v => {
		if (Array.isArray(v)) throw new TypeError('Lists must be flat');
		return emitScalar(v);
	}).join(', ') + ']' : emitScalar(value);
}

function emitKey(key) {
	if (typeof key !== 'string' || !key || /[\x00-\x1f\x7f\r\n]/.test(key) || !key.isWellFormed()) throw new TypeError('Property names must be nonempty single-line text');
	return emitScalar(key); // A mapping key is text too: `true`, dates and numbers must stay strings.
}

function cutLine(line, comment) {
	if (comment == null) return {start: line.start, end: line.next, text: ''};
	const leading = /^ */.exec(line.text)[0];
	return {start: line.start, end: comment, text: leading};
}

export function serializeFrontMatter(parsed, edits = new Map()) {
	const record = records.get(parsed);
	if (!record) throw new TypeError('Use the result of parseFrontMatter');
	const changes = edits instanceof Map ? edits : new Map(Object.entries(edits));
	const patches = [], append = [], remaining = new Set(record.spans.filter(s => s.h).map(s => s.field.key));
	for (const [key, value] of changes) {
		const keyText = emitKey(key), encoded = value === undefined ? '' : emit(value);
		const matches = record.spans.filter(s => s.field.key === key);
		if (matches.length > 1) throw new RangeError('Duplicate property cannot be edited: ' + key);
		if (!matches.length) {
			if (value !== undefined && record.uncertain) throw new RangeError('Unresolved structure prevents adding a property');
			if (value !== undefined) { append.push(keyText + ': ' + encoded + parsed.eol); remaining.add(key); }
			continue;
		}
		const span = matches[0], h = span.h;
		if (span.field.value === undefined) throw new RangeError('Opaque property cannot be edited: ' + key);
		if (same(span.field.value, value)) continue;
		if (value === undefined) {
			remaining.delete(key);
			patches.push(cutLine(h.line, h.comment));
			for (const item of span.items) patches.push(cutLine(item.line, item.comment));
		} else if (span.items.length && Array.isArray(value) && value.length) {
			for (let i = 0; i < span.items.length; i++) {
				const item = span.items[i];
				if (i >= value.length) patches.push(cutLine(item.line, item.comment));
				else if (!same(item.value, value[i])) patches.push({start: item.start, end: item.end, text: emitScalar(value[i])});
			}
			if (value.length > span.items.length) {
				const last = span.items.at(-1);
				patches.push({start: last.line.next, end: last.line.next, text: value.slice(span.items.length).map(v => last.indent + '- ' + emitScalar(v) + (last.line.eol || parsed.eol)).join('')});
			}
		} else {
			patches.push({start: h.start, end: h.end, text: (record.text[h.start - 1] === ':' ? ' ' : '') + encoded + (h.start === h.comment ? ' ' : '')});
			for (const item of span.items) patches.push(cutLine(item.line, item.comment));
		}
	}
	if (!patches.length && !append.length) return record.text;
	if (!parsed.present) return parsed.bom + '---' + parsed.eol + append.join('') + '---' + parsed.eol + record.text.slice(parsed.bom.length);
	if (append.length) patches.push({start: record.closing.start, end: record.closing.start, text: append.join('')});
	patches.sort((a, b) => b.start - a.start || b.end - a.end);
	let out = record.text;
	for (const patch of patches) out = out.slice(0, patch.start) + patch.text + out.slice(patch.end);
	if (!remaining.size) {
		const {opening, closing} = frontMatterFrame(out);
		// A deleted field can leave comments; without the frame they become document content.
		if (/^[ \t\r\n]*$/.test(out.slice(opening.next, closing.start)))
			out = out.slice(0, opening.start) + out.slice(opening.next, closing.start) + out.slice(closing.next);
	}
	return out;
}

function names(values, hash) {
	const out = [], seen = new Set();
	for (const value of values) {
		if (typeof value !== 'string') continue;
		const name = (hash ? value.trim().replace(/^#/, '') : value.trim()).trim();
		const key = name.normalize('NFC').toLowerCase();
		if (!name || seen.has(key)) continue;
		seen.add(key); out.push(name);
	}
	return out;
}

function listOf(text, keys, hash) {
	const values = [];
	for (const field of parseFrontMatter(text).fields) if (keys.includes(field.key)) values.push(...(Array.isArray(field.value) ? field.value : [field.value]));
	return names(values, hash);
}

export function tagsOf(text) { return listOf(text, ['tags', 'tag'], true); }
export function aliasesOf(text) { return listOf(text, ['aliases'], false); }
export function stripFrontMatter(text) { return parseFrontMatter(text).body; }
export function propertiesOf(text) {
	const out = new Map();
	for (const {key, value} of parseFrontMatter(text).fields) if (key !== undefined) out.set(key, out.has(key) ? undefined : value);
	return out;
}
export function setProperty(text, key, value) { return serializeFrontMatter(parseFrontMatter(text), new Map([[key, value]])); }
export function setTags(text, tags) {
	if (!Array.isArray(tags) || Array.from(tags).some(tag => typeof tag !== 'string')) throw new TypeError('Tags must be a list of strings');
	const wanted = names(tags, true), current = tagsOf(text);
	if (same(current, wanted)) return text;
	return serializeFrontMatter(parseFrontMatter(text), new Map([['tags', wanted.length ? wanted : undefined], ['tag', undefined]]));
}
