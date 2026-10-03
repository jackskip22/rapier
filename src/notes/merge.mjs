// SPDX-License-Identifier: AGPL-3.0-only
// Exact source survives; only an inspected conflict choice may remove a variant.
import {isNoteFile, isCodeFile, cleanRemind} from './model.mjs';

function textFault(code, message) { return Object.assign(new Error(message), {code}); }
export function canonicalNote(text) {
	if (typeof text !== 'string') throw textFault('note_text', 'A note must be text');
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c >= 0xd800 && c <= 0xdbff) {
			const next = text.charCodeAt(++i);
			if (!(next >= 0xdc00 && next <= 0xdfff)) throw textFault('note_unicode', 'An unpaired surrogate has no exact UTF-8 bytes');
		} else if (c >= 0xdc00 && c <= 0xdfff) throw textFault('note_unicode', 'An unpaired surrogate has no exact UTF-8 bytes');
	}
	return text;
}

const TEXT_CONFLICT = '<!-- note-conflict:v1 ';
const textLine = line => line.replace(/(?:\r\n|\r|\n)$/, '');
const textBlank = line => /^[ \t]*$/.test(textLine(line));
const textSpace = unit => /^[ \t\r\n]*$/.test(unit);
const textList = line => /^( {0,3})(?:[-+*]|\d{1,9}[.)])[ \t]+/.exec(line);
const textFence = line => /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
const textRule = line => /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
const textHeading = line => /^ {0,3}#{1,6}(?:[ \t]|$)/.test(line);
const textDefinition = line => /^ {0,3}\[(?:\\.|[^\]\\\r\n])+\]:/.test(line);
const textStart = line => textHeading(line) || textRule(line) || textFence(line) || /^ {0,3}(?:[-+*]|1[.)])[ \t]+/.test(line) || /^ {0,3}(?:>|<!--|<(?:script|style|pre|textarea)(?:\s|>))/i.test(line);

// Only the exact public envelope is structural; malformed comments and fenced examples stay text.
function textEnvelopeAt(text, start = 0) {
	if (!text.startsWith(TEXT_CONFLICT, start)) return null;
	const headerEnd = text.indexOf(' -->\n\n', start), variants = [];
	if (headerEnd < 0) return null;
	let header;
	try { header = JSON.parse(text.slice(start + TEXT_CONFLICT.length, headerEnd)); } catch { return null; }
	if (!header || typeof header.id !== 'string' || !Array.isArray(header.variants) || header.variants.length < 2) return null;
	let at = headerEnd + 6;
	for (const item of header.variants) {
		if (!item || typeof item.device !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(item.device) || !Number.isSafeInteger(item.length) || item.length < 0) return null;
		const label = '**Version from ' + item.device + '**\n\n';
		if (!text.startsWith(label, at)) return null;
		at += label.length;
		const fence = /^(`{3,})markdown\n/.exec(text.slice(at));
		if (!fence) return null;
		at += fence[0].length;
		const value = text.slice(at, at + item.length); at += item.length;
		const tail = (value.endsWith('\n') ? '' : '\n') + fence[1] + '\n\n';
		if (!text.startsWith(tail, at)) return null;
		at += tail.length; variants.push({device: item.device, text: value});
	}
	const tail = '<!-- /note-conflict:v1 -->\n';
	if (!text.startsWith(tail, at)) return null;
	const end = at + tail.length, block = text.slice(start, end);
	if (textEnvelope(header.id, variants) !== block) return null;
	return {kind: 'text', id: header.id, start, end, block, variants};
}

export function inspectTextConflicts(text, {nested = false} = {}) {
	canonicalNote(text);
	const out = []; let at = 0;
	for (const unit of textUnits(text)) {
		const found = textEnvelopeAt(unit);
		if (found && found.end === unit.length) {
			out.push({...found, start: at, end: at + unit.length});
			// Nested offsets belong to their alternative's source; custody callers use
			// the exact block bytes. Ordinary fenced examples remain opaque at every level.
			if (nested) for (const variant of found.variants) out.push(...inspectTextConflicts(variant.text, {nested}));
		}
		at += unit.length;
	}
	return out;
}

export function mapTextConflictVariants(text, mapper) {
	const conflicts = inspectTextConflicts(text); let out = '', at = 0;
	for (const block of conflicts) {
		out += text.slice(at, block.start) + textEnvelope(block.id, block.variants.map(variant => ({
			device: variant.device, text: canonicalNote(mapper(mapTextConflictVariants(variant.text, mapper), variant.device)),
		})));
		at = block.end;
	}
	return out + text.slice(at);
}

// This is a conservative edit boundary scan, never the document's rendering grammar.
function textUnits(text) {
	const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || [], out = [], offsets = [0];
	for (const line of lines) offsets.push(offsets[offsets.length - 1] + line.length);
	for (let i = 0; i < lines.length;) {
		const start = i, first = textLine(lines[i]).replace(/^\ufeff/, ''), list = textList(first), fence = textFence(first);
		const envelope = first.startsWith(TEXT_CONFLICT) ? textEnvelopeAt(text, offsets[i]) : null;
		if (envelope) {
			while (i < lines.length && offsets[i] < envelope.end) i++;
			out.push(lines.slice(start, i).join('')); continue;
		}
		if (textBlank(lines[i])) { while (++i < lines.length && textBlank(lines[i])) {} }
		else if (fence) {
			const mark = fence[1][0], count = fence[1].length;
			i++;
			while (i < lines.length) {
				const close = new RegExp('^ {0,3}' + (mark === '`' ? '`' : '~') + '{' + count + ',}[ \\t]*$').test(textLine(lines[i++]));
				if (close) break;
			}
		} else if (list) {
			const indent = list[1].length;
			i++;
			while (i < lines.length) {
				const line = textLine(lines[i]), next = textList(line);
				if (next && next[1].length <= indent) break;
				if (textBlank(lines[i])) {
					let j = i; while (j < lines.length && textBlank(lines[j])) j++;
					if (j === lines.length || !new RegExp('^(?: {' + (indent + 1) + ',}|\\t)').test(lines[j])) break;
					i = j; continue;
				}
				if (!/^[ \t]/.test(line) && textStart(line)) break;
				i++;
			}
		} else if (/^ {0,3}>/.test(first)) {
			i++;
			while (i < lines.length) {
				if (textBlank(lines[i])) {
					let j = i; while (j < lines.length && textBlank(lines[j])) j++;
					if (j === lines.length || !/^ {0,3}>/.test(lines[j])) break;
					i = j; continue;
				}
				if (!/^ {0,3}>/.test(lines[i]) && textStart(textLine(lines[i]))) break;
				i++;
			}
		} else if (/^ {0,3}<!--/.test(first)) {
			i++;
			if (!first.includes('-->')) while (i < lines.length && !lines[i++].includes('-->')) {}
		} else if (/^ {0,3}<(script|style|pre|textarea)(?:\s|>)/i.test(first)) {
			const tag = /^ {0,3}<([a-z]+)/i.exec(first)[1]; i++;
			if (!new RegExp('</' + tag + '\\s*>', 'i').test(first)) while (i < lines.length && !new RegExp('</' + tag + '\\s*>', 'i').test(lines[i++])) {}
		} else if (textHeading(first) || textRule(first)) i++;
		else {
			i++;
			while (i < lines.length && !textBlank(lines[i])) {
				if (/^ {0,3}(?:=+|-+)[ \t]*$/.test(textLine(lines[i]))) { i++; break; }
				if (textStart(textLine(lines[i]))) break;
				i++;
			}
			if (textDefinition(first) || /^(?: {4}|\t)/.test(first)) {
				while (i < lines.length) {
					let j = i; while (j < lines.length && textBlank(lines[j])) j++;
					if (j === lines.length || !/^(?: {4}|\t)/.test(lines[j])) break;
					i = j + 1; while (i < lines.length && !textBlank(lines[i]) && /^(?: {4}|\t)/.test(lines[i])) i++;
				}
			}
		}
		out.push(lines.slice(start, i).join(''));
	}
	return out;
}

function textEdits(base, side) {
	const n = base.length, m = side.length;
	if ((n + 1) * (m + 1) > 1000000) return null;
	const width = m + 1, score = new Uint32Array((n + 1) * width);
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
		const p = i * width + j;
		score[p] = base[i] === side[j] ? score[p + width + 1] + 1 : Math.max(score[p + width], score[p + 1]);
	}
	const walk = () => {
		const pairs = []; let i = 0, j = 0;
		while (i < n && j < m) {
			const value = score[i * width + j]; if (!value) break;
			if (base[i] === side[j]) { pairs.push([i++, j++]); continue; }
			if (score[(i + 1) * width + j] >= score[i * width + j + 1]) i++; else j++;
		}
		return pairs;
	};
	const pairs = walk(), meaningful = pairs.filter(([i]) => !textSpace(base[i]));
	// Every optimal path must agree on every authored anchor, not just two greedy walks.
	const seen = new Uint32Array(score.length); seen.fill(0xffffffff); seen[0] = 0;
	for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
		const p = i * width + j, at = seen[p]; if (at === 0xffffffff) continue;
		const visit = (next, count) => { if (seen[next] !== 0xffffffff && seen[next] !== count) return false; seen[next] = count; return true; };
		if (i < n && score[p + width] === score[p] && !visit(p + width, at)) return null;
		if (j < m && score[p + 1] === score[p] && !visit(p + 1, at)) return null;
		if (i < n && j < m && base[i] === side[j] && score[p] === score[p + width + 1] + 1) {
			const content = !textSpace(base[i]);
			if (content && (meaningful[at]?.[0] !== i || meaningful[at]?.[1] !== j)) return null;
			if (!visit(p + width + 1, at + (content ? 1 : 0))) return null;
		}
	}
	if (seen[n * width + m] !== meaningful.length) return null;
	const edits = []; let i = 0, j = 0;
	for (const [bi, sj] of [...pairs, [n, m]]) {
		if (i !== bi || j !== sj) edits.push({start: i, end: bi, text: side.slice(j, sj).join('')});
		i = bi + 1; j = sj + 1;
	}
	return edits;
}

function textTick(base, a, b) {
	const box = value => {
		const m = /^( {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+\[)([ xX])(\])/.exec(value);
		return m && {at: m[1].length, tick: m[2], body: value.slice(0, m[1].length) + ' ' + value.slice(m[1].length + 1)};
	};
	const c = box(base); if (!c) return null;
	// One side ticked, the other added lines: the tick lands on the item found whole among the other side's units. Ambiguity is a conflict.
	const au = textUnits(a), bu = textUnits(b);
	if (au.length !== 1 || bu.length !== 1) {
		const [one, many] = au.length === 1 ? [a, bu] : bu.length === 1 ? [b, au] : [null, null];
		const x = one === null ? null : box(one);
		if (!x || x.body !== c.body || x.tick === c.tick) return null;
		const at = many.map((unit, i) => unit === base ? i : -1).filter(i => i >= 0);
		if (at.length !== 1) return null;
		return many.map((unit, i) => i === at[0] ? one : unit).join('');
	}
	const x = box(a), y = box(b); if (!x || !y) return null;
	const body = x.body === y.body ? x.body : x.body === c.body ? y.body : y.body === c.body ? x.body : null;
	if (body === null) return null;
	const marked = x.tick !== ' ' && y.tick !== ' ' ? [x.tick, y.tick].sort()[0] : x.tick === c.tick ? y.tick : y.tick === c.tick ? x.tick : null;
	const at = box(body).at;
	return marked === null ? null : body.slice(0, at) + marked + body.slice(at + 1);
}

function textDeviceOptions(options) {
	const {oursId, theirsId} = options || {};
	if (![oursId, theirsId].every(id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) || oursId === theirsId) {
		throw textFault('merge_devices', 'A conflict needs two distinct stable device identifiers');
	}
	return [oursId, theirsId];
}

function textEnvelope(id, variants) {
	let longest = 2;
	for (const v of variants) for (const run of v.text.match(/`+/g) || []) longest = Math.max(longest, run.length);
	const fence = '`'.repeat(longest + 1);
	let out = TEXT_CONFLICT + JSON.stringify({id, variants: variants.map(v => ({device: v.device, length: v.text.length}))}) + ' -->\n\n';
	for (const v of variants) {
		out += '**Version from ' + v.device + '**\n\n' + fence + 'markdown\n' + v.text + (v.text.endsWith('\n') ? '' : '\n') + fence + '\n\n';
	}
	return out + '<!-- /note-conflict:v1 -->\n';
}

function textDeclarations(text) {
	text = textUnits(text).filter(unit => !textEnvelopeAt(unit)).join('');
	// A definition can move a destination/title onto the next unindented line, or span its label.
	const definitions = text.match(/^\ufeff? {0,3}\[(?:\\.|[^\]\\])+\]:[^\r\n]*(?:(?:\r\n|\r|\n)(?![ 	]*(?:\r\n|\r|\n|$))[^\r\n]*)*/gm) || [];
	const continuations = textUnits(text).filter(unit => /^\ufeff? {0,3}\[\^/.test(unit));
	return [...definitions, ...continuations, ...(text.match(/<!--[\s\S]*?(?:-->|$)/g) || [])].join('\0');
}

export function mergeText(base, ours, theirs, options = {}) {
	canonicalNote(ours); canonicalNote(theirs); if (base !== null) canonicalNote(base);
	const unchanged = value => ({text: value, clean: !value.includes(TEXT_CONFLICT), conflicts: value.includes(TEXT_CONFLICT) ? [{kind: 'existing-conflict', advisory: true}] : []});
	if (ours === theirs) return unchanged(ours);
	if (base === ours) return unchanged(theirs);
	if (base === theirs) return unchanged(ours);
	const conflicts = []; let text = '';
	const conflict = (before, a, b, kind) => {
		// Shared framing remains ordinary text; only the changed region is a choice.
		const ab = inspectTextConflicts(a), bb = inspectTextConflicts(b);
		const au = textUnits(a), bu = textUnits(b); let first = 0, last = 0;
		while (first < Math.min(au.length, bu.length) && au[first] === bu[first]) first++;
		while (last < Math.min(au.length, bu.length) - first && au[au.length - 1 - last] === bu[bu.length - 1 - last]) last++;
		if ((ab.length || bb.length) && (first || last)) {
			const prefix = au.slice(0, first).join(''), suffix = last ? au.slice(-last).join('') : '';
			text += prefix;
			conflict(null, au.slice(first, last ? -last : undefined).join(''), bu.slice(first, last ? -last : undefined).join(''), kind);
			text += suffix; return;
		}
		// A shared unresolved region is an anchor even when its alternatives have grown. Splitting
		// around it keeps surrounding edits in their own choices instead of quoting an old choice.
		const overlaps = (x, y) => x.variants.some(v => y.variants.some(w => v.device === w.device && v.text === w.text));
		const anchor = ab.map(x => ({x, matches: bb.filter(y => overlaps(x, y))})).find(({x, matches}) =>
			matches.length === 1 && ab.filter(y => overlaps(y, matches[0])).length === 1 &&
			(x.start || matches[0].start || x.end < a.length || matches[0].end < b.length));
		if (anchor) {
			const {x, matches: [y]} = anchor;
			for (const [av, bv] of [[a.slice(0, x.start), b.slice(0, y.start)], [x.block, y.block], [a.slice(x.end), b.slice(y.end)]]) {
				if (av === bv) text += av; else conflict(null, av, bv, kind);
			}
			return;
		}
		const ids = textDeviceOptions(options), candidates = [{device: ids[0], text: a}, {device: ids[1], text: b}];
		const variants = [...new Map(candidates.flatMap(v => {
			const block = textEnvelopeAt(v.text);
			return block && block.end === v.text.length ? block.variants : [v];
		}).map(v => [JSON.stringify(v), v])).values()].sort((x, y) => x.device < y.device ? -1 : x.device > y.device ? 1 : x.text < y.text ? -1 : x.text > y.text ? 1 : 0);
		if (text && !/[\r\n]$/.test(text)) text += '\n\n';
		const start = text.length, block = textEnvelope(String(conflicts.length), variants);
		conflicts.push({kind, base: before, variants, start, end: start + block.length, block});
		text += block;
	};
	if (base === null) conflict(null, ours, theirs, 'no-ancestor');
	else if (textDeclarations(ours) !== textDeclarations(base) || textDeclarations(theirs) !== textDeclarations(base)) conflict(base, ours, theirs, 'document-bindings');
	else {
		const units = textUnits(base), a = textEdits(units, textUnits(ours)), b = textEdits(units, textUnits(theirs));
		if (!a || !b) conflict(base, ours, theirs, 'ambiguous-alignment-or-budget');
		else {
			const changes = [...a.map(e => ({...e, side: 0})), ...b.map(e => ({...e, side: 1}))].sort((x, y) => x.start - y.start || x.end - y.end || x.side - y.side);
			let pos = 0;
			for (let i = 0; i < changes.length;) {
				const group = [changes[i++]], start = group[0].start; let end = group[0].end;
				// An insertion can anchor on either side of a blank run; that is still one gap.
				while (i < changes.length && (changes[i].start < end || group.some(e => {
					const next = changes[i];
					// Appending after an unresolved block does not edit any of its alternatives.
					const afterBlock = (edit, insert) => insert.start === insert.end && insert.start === edit.end && edit.start < edit.end && units.slice(edit.start, edit.end).every(unit => textEnvelopeAt(unit));
					if (afterBlock(e, next) || afterBlock(next, e)) return false;
					if (e.start === e.end && next.start <= e.start && e.start <= next.end) return true;
					if (next.start === next.end && e.start <= next.start && next.start <= e.end) return true;
					return next.start >= e.end && units.slice(e.start, e.end).every(textSpace) &&
						units.slice(e.end, next.start).every(textSpace) && units.slice(next.start, next.end).every(textSpace);
				}))) {
					group.push(changes[i]); end = Math.max(end, changes[i++].end);
				}
				text += units.slice(pos, start).join('');
				const before = units.slice(start, end).join('');
				const version = side => {
					let value = '', at = start;
					for (const e of group.filter(e => e.side === side)) { value += units.slice(at, e.start).join('') + e.text; at = e.end; }
					return value + units.slice(at, end).join('');
				};
				const av = version(0), bv = version(1);
				if (av === bv) text += av;
				else if (av === before) text += bv;
				else if (bv === before) text += av;
				else {
					const tick = end === start + 1 ? textTick(before, av, bv) : null;
					if (tick !== null) text += tick; else conflict(before, av, bv, 'text');
				}
				pos = end;
			}
			text += units.slice(pos).join('');
		}
	}
	return {text, clean: conflicts.length === 0 && !text.includes(TEXT_CONFLICT), conflicts};
}

// A marker is advisory data. The caller supplies its trusted descriptor and current revision.
export function resolveTextConflict(text, conflict, device) {
	canonicalNote(text);
	if (!conflict || !Number.isInteger(conflict.start) || !Number.isInteger(conflict.end) || conflict.start < 0 || conflict.end < conflict.start || text.slice(conflict.start, conflict.end) !== conflict.block) {
		throw textFault('merge_stale', 'The inspected conflict changed');
	}
	const matches = Number.isInteger(device) ? [conflict.variants?.[device]].filter(Boolean) : conflict.variants?.filter(v => v.device === device) || [];
	const version = matches.length === 1 ? matches[0] : null;
	if (!version) throw textFault('merge_choice', 'Choose one inspected version');
	canonicalNote(version.text);
	return text.slice(0, conflict.start) + version.text + text.slice(conflict.end);
}

const IX_MISSING = Symbol('missing');
const ixOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const ixGet = (value, key) => value && ixOwn(value, key) ? value[key] : IX_MISSING;
const ixRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const ixFail = (message, code = 'corrupt') => { throw Object.assign(new Error(message), {code}); };
const ixPut = (value, key, field) => { if (field !== IX_MISSING) Object.defineProperty(value, key, {value: field, enumerable: true, writable: true, configurable: true}); };
const ixCompare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function ixString(value) {
	for (let i = 0; i < value.length; i++) {
		const c = value.charCodeAt(i);
		if (c >= 0xD800 && c <= 0xDBFF) { const d = value.charCodeAt(++i); if (!(d >= 0xDC00 && d <= 0xDFFF)) ixFail('unpaired surrogate'); }
		else if (c >= 0xDC00 && c <= 0xDFFF) ixFail('unpaired surrogate');
	}
	return JSON.stringify(value);
}

function ixJSON(value, stack = new Set()) {
	if (value === null || typeof value === 'boolean') return JSON.stringify(value);
	if (typeof value === 'string') return ixString(value);
	if (typeof value === 'number') { if (!Number.isFinite(value) || Object.is(value, -0)) ixFail('non-canonical JSON number'); return JSON.stringify(value); }
	if (!Array.isArray(value) && !ixRecord(value)) ixFail('non-JSON value');
	if (stack.has(value)) ixFail('cyclic JSON value');
	stack.add(value);
	const keys = Reflect.ownKeys(value);
	for (const key of keys) {
		if (typeof key !== 'string') ixFail('symbol key');
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!ixOwn(descriptor, 'value') || (!descriptor.enumerable && !(Array.isArray(value) && key === 'length'))) ixFail('non-JSON property');
	}
	let out;
	if (Array.isArray(value)) {
		if (keys.length !== value.length + 1) ixFail('sparse array or extra array property');
		out = '[' + Array.from({length: value.length}, (_, i) => {
			if (!ixOwn(value, i)) ixFail('sparse array');
			return ixJSON(value[i], stack);
		}).join(',') + ']';
	} else out = '{' + keys.sort().map(key => ixString(key) + ':' + ixJSON(value[key], stack)).join(',') + '}';
	stack.delete(value);
	return out;
}
const ixEqual = (a, b) => a === IX_MISSING || b === IX_MISSING ? a === b : ixJSON(a) === ixJSON(b);
const ixClone = value => JSON.parse(ixJSON(value));
const ixFile = file => isNoteFile(file) && !/[\u0000-\u001F]/.test(file);
const ixID = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}:[1-9][0-9]*$/.test(id) && Number.isSafeInteger(Number(id.slice(id.lastIndexOf(':') + 1)));

function ixValidate(index, ids = false) {
	ixJSON(index);
	if (!ixRecord(index) || index.version !== 1 || !ixRecord(index.notes)) ixFail('unrecognized notes index', index?.version > 1 ? 'newer' : 'corrupt');
	const seen = new Set();
	for (const [file, entry] of Object.entries(index.notes)) {
		if (!ixFile(file) || !ixRecord(entry)) ixFail('invalid note entry');
		if (ids && !ixOwn(entry, 'id')) ixFail('admit notes before merging', 'identity');
		if (ixOwn(entry, 'id')) { if (!ixID(entry.id) || seen.has(entry.id)) ixFail('invalid or duplicated note identity', 'identity'); seen.add(entry.id); }
		for (const key of ['pinned', 'skill', 'archived', 'trashed']) if (ixOwn(entry, key) && typeof entry[key] !== 'boolean') ixFail('invalid note flag');
		for (const key of ['category', 'colour', 'revision', 'remindDoneFor']) if (ixOwn(entry, key) && typeof entry[key] !== 'string') ixFail('invalid note field');
		if (ixOwn(entry, 'revision') && !entry.revision) ixFail('empty content revision');
		if (ixOwn(entry, 'order') && (typeof entry.order !== 'string' || !/^[0-9A-Za-z]*$/.test(entry.order))) ixFail('invalid order key');
		if (ixOwn(entry, 'remind')) {
			const r = entry.remind;
			if (!ixRecord(r) || !cleanRemind(r)) ixFail('invalid reminder');
		}
		if (ixOwn(entry, 'remindDone') && (!Number.isSafeInteger(entry.remindDone) || entry.remindDone < 0)) ixFail('invalid reminder acknowledgement');
		if (ixOwn(entry, 'remindSnoozedUntil') && (!Number.isSafeInteger(entry.remindSnoozedUntil) || entry.remindSnoozedUntil < 0 || entry.remindSnoozedUntil > 8_640_000_000_000_000)) ixFail('invalid reminder snooze');
		if (ixOwn(entry, 'remindAction') && (typeof entry.remindAction !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(entry.remindAction))) ixFail('invalid reminder action');
	}
	if (ixOwn(index, 'sections')) {
		if (!Array.isArray(index.sections)) ixFail('invalid sections');
		const names = new Set();
		for (const section of index.sections) {
			if (!ixRecord(section) || typeof section.name !== 'string' || !section.name.trim() || names.has(section.name.toLowerCase())) ixFail('invalid or duplicate section');
			if (ixOwn(section, 'collapsed') && typeof section.collapsed !== 'boolean') ixFail('invalid section collapse state');
			names.add(section.name.toLowerCase());
		}
	}
	if (ixOwn(index, 'collapsed') && (!ixRecord(index.collapsed) || Object.values(index.collapsed).some(value => typeof value !== 'boolean'))) ixFail('invalid built-in collapse state');
	if (ixOwn(index, 'tombstones')) {
		if (!ixRecord(index.tombstones)) ixFail('invalid tombstones');
		for (const [id, records] of Object.entries(index.tombstones)) {
			if (!ixID(id) || !Array.isArray(records)) ixFail('invalid tombstone identity');
			for (const record of records) if (!ixRecord(record) || !ixID(record.opId) || typeof record.revision !== 'string' || !record.revision || !ixFile(record.file)) ixFail('invalid tombstone record');
		}
	}
	if (ixOwn(index, 'conflicts') && !Array.isArray(index.conflicts)) ixFail('invalid conflict ledger');
}

// Compact sorted JSON + LF; never clean away a field before deciding its bytes.
export function canonicalJSON(value) { return ixJSON(value) + '\n'; }
export function canonicalIndex(index) { ixValidate(index); return canonicalJSON(index); }

export function admitIndex(index, {deviceId, nextCounter} = {}) {
	ixValidate(index);
	if (typeof deviceId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(deviceId) || !Number.isSafeInteger(nextCounter) || nextCounter < 1) ixFail('admission needs a namespace and durable next counter', 'identity');
	const out = ixClone(index), assigned = [];
	const used = [...Object.values(out.notes).map(entry => entry.id), ...Object.keys(out.tombstones || {}), ...Object.values(out.tombstones || {}).flat().map(record => record.opId)].filter(Boolean);
	for (const id of used) if (id.startsWith(deviceId + ':')) nextCounter = Math.max(nextCounter, Number(id.slice(deviceId.length + 1)) + 1);
	for (const file of Object.keys(out.notes).sort()) {
		if (out.notes[file].id) continue;
		if (!Number.isSafeInteger(nextCounter) || nextCounter === Number.MAX_SAFE_INTEGER) ixFail('note identity counter exhausted', 'identity');
		const id = deviceId + ':' + nextCounter++;
		out.notes[file].id = id; assigned.push({file, id});
	}
	if (!Number.isSafeInteger(nextCounter)) ixFail('note identity counter exhausted', 'identity');
	return {index: out, nextCounter, assigned};
}

function ixDevices(context) {
	const {oursId, theirsId} = context.options;
	if (typeof oursId !== 'string' || !oursId || typeof theirsId !== 'string' || !theirsId || oursId === theirsId) ixFail('conflicting merge needs distinct device identities', 'devices');
	ixString(oursId); ixString(theirsId);
	return [oursId, theirsId];
}
const ixPresent = value => value === IX_MISSING ? {present: false} : {present: true, value};
function ixConflict(context, kind, path, base, ours, theirs, extra = {}) {
	const devices = ixDevices(context);
	context.conflicts.push({kind, path, base: ixPresent(base), variants: [ours, theirs].map((value, i) => ({device: devices[i], ...ixPresent(value)})).sort((a, b) => ixCompare(a.device, b.device)), ...extra});
}
function ixField(context, base, ours, theirs, path, kind = 'field') {
	if (ixEqual(ours, theirs)) return ours;
	if (ixEqual(ours, base)) return theirs;
	if (ixEqual(theirs, base)) return ours;
	ixConflict(context, kind, path, base, ours, theirs);
	return ixDevices(context)[0] < ixDevices(context)[1] ? ours : theirs;
}
function ixFields(context, base, ours, theirs, path, excluded = []) {
	const out = {};
	for (const key of [...new Set([base, ours, theirs].flatMap(value => value === IX_MISSING ? [] : Object.keys(value)))].sort()) {
		if (!excluded.includes(key)) ixPut(out, key, ixField(context, ixGet(base, key), ixGet(ours, key), ixGet(theirs, key), [...path, key]));
	}
	return out;
}

function ixReminders(context, base, ours, theirs, out, path) {
	const definitions = [base, ours, theirs].map(entry => ixGet(entry, 'remind'));
	const remind = ixField(context, ...definitions, [...path, 'remind']);
	ixPut(out, 'remind', remind);
	let unsafe = false;
	const done = [base, ours, theirs].map((entry, i) => {
		const value = ixGet(entry, 'remindDone');
		if (value === IX_MISSING) return IX_MISSING;
		const definition = definitions[i], binding = ixGet(entry, 'remindDoneFor');
		const bound = definition !== IX_MISSING && binding === ixJSON(definition);
		if (!bound || !ixEqual(definition, remind)) {
			if (i && (binding !== IX_MISSING || !ixEqual(value, ixGet(base, 'remindDone')) || !ixEqual(definition, definitions[0]))) unsafe = true;
			return IX_MISSING;
		}
		return value;
	});
	if (unsafe) ixConflict(context, 'reminder-ack-definition', path, base, ours, theirs);
	if (remind === IX_MISSING) return;
	const merged = done[1] !== IX_MISSING && done[2] !== IX_MISSING ? Math.max(done[1], done[2]) : ixField(context, ...done, [...path, 'remindDone']);
	if (merged !== IX_MISSING) { out.remindDone = merged; out.remindDoneFor = ixJSON(remind); }
}

function ixChanged(context, base, side, which) {
	if (base === IX_MISSING) return true;
	if (base.file !== side.file) return true;
	const omit = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['id', 'revision', 'trashed', 'modified', 'created'].includes(key)));
	if (!ixEqual(omit(base.entry), omit(side.entry))) return true;
	const before = ixGet(base.entry, 'revision'), after = ixGet(side.entry, 'revision');
	if (before !== IX_MISSING && after !== IX_MISSING && before !== after) return true;
	const evidence = context.options.changedNoteIDs?.[which];
	if (evidence !== undefined) return evidence.includes(side.entry.id);
	return before === IX_MISSING || after === IX_MISSING ? null : false;
}

function ixMergeEntry(context, base, ours, theirs, id) {
	const entries = [base, ours, theirs].map(value => value === IX_MISSING ? IX_MISSING : value.entry), path = ['notes', id];
	const out = ixFields(context, ...entries, path, ['id', 'revision', 'modified', 'remind', 'remindDone', 'remindDoneFor']);
	out.id = id;
	// Autosave stamps describe display recency, never competing user edits.
	const modified = entries.map(entry => ixGet(entry, 'modified')), times = modified.filter(value => value !== IX_MISSING);
	ixPut(out, 'modified', modified.slice(1).every(Number.isFinite) && times.every(Number.isFinite) ? Math.max(...times) : ixField(context, ...modified, [...path, 'modified']));
	const revisions = entries.map(entry => ixGet(entry, 'revision'));
	if (context.options.mergedRevisions && ixOwn(context.options.mergedRevisions, id)) out.revision = context.options.mergedRevisions[id];
	else {
		const divergent = !ixEqual(revisions[1], revisions[2]) && !ixEqual(revisions[1], revisions[0]) && !ixEqual(revisions[2], revisions[0]);
		const revision = ixField(context, ...revisions, [...path, 'revision'], 'content-revision');
		if (!divergent) ixPut(out, 'revision', revision);
	}
	ixReminders(context, ...entries, out, path);
	for (const [trash, other, which] of [[ours, theirs, 'theirs'], [theirs, ours, 'ours']]) {
		if (trash === IX_MISSING || other === IX_MISSING || trash.entry.trashed !== true || other.entry.trashed === true || base !== IX_MISSING && base.entry.trashed === true) continue;
		const changed = ixChanged(context, base, other, which);
		if (changed !== false) {
			out.trashed = false; out.archived = false;
			ixConflict(context, changed === null ? 'trash-change-unknown' : 'trash-edit', path, ...entries);
		}
	}
	const file = ixField(context, ...[base, ours, theirs].map(value => value === IX_MISSING ? IX_MISSING : value.file), [...path, 'file'], 'rename');
	return {file, entry: out};
}

function ixTombstones(context, indexes) {
	const out = {};
	for (const id of [...new Set(indexes.flatMap(index => Object.keys(index?.tombstones || {})))].sort()) {
		const values = indexes.map(index => index?.tombstones?.[id] || []), records = new Map();
		for (const record of values.flat()) records.set(ixJSON(record), record);
		const entries = [...records.values()].sort((a, b) => ixCompare(a.opId, b.opId) || ixCompare(ixJSON(a), ixJSON(b)));
		if (new Set(entries.map(record => record.opId)).size !== entries.length) ixConflict(context, 'tombstone-operation', ['tombstones', id], ...values);
		ixPut(out, id, entries);
	}
	return out;
}
const ixNewDeletes = (base, side, id) => (side?.tombstones?.[id] || []).filter(record => !(base?.tombstones?.[id] || []).some(old => old.opId === record.opId));
// A new operation does not prove that an older retained blob covers newer work.
const ixDeleteCovers = (records, note) => ixOwn(note.entry, 'revision') && records.some(record => record.revision === note.entry.revision);

function ixSections(context, indexes, notes) {
	const lists = indexes.map(index => index?.sections || []), keys = lists.map(list => list.map(section => section.name.toLowerCase()));
	const maps = lists.map(list => new Map(list.map(section => [section.name.toLowerCase(), section]))), kept = new Map();
	const noteMaps = indexes.map(index => new Map(Object.values(index?.notes || {}).map(entry => [entry.id, entry])));
	const relation = (list, a, b) => !list.includes(a) || !list.includes(b) ? IX_MISSING : list.indexOf(a) < list.indexOf(b);
	for (const id of [...new Set(keys.flat())].sort()) {
		const values = maps.map(map => map.get(id) ?? IX_MISSING), [base, ours, theirs] = values;
		if (ours === IX_MISSING && theirs === IX_MISSING) continue;
		if (base !== IX_MISSING && (ours === IX_MISSING || theirs === IX_MISSING)) {
			const i = ours === IX_MISSING ? 2 : 1, live = values[i];
			const moved = keys[0].some(other => relation(keys[i], id, other) !== IX_MISSING && relation(keys[i], id, other) !== relation(keys[0], id, other));
			const references = [...noteMaps[i].values()].filter(entry => entry.category === live.name && ixGet(noteMaps[0].get(entry.id), 'category') !== entry.category).map(entry => entry.id).sort();
			if (ixEqual(base, live) && !moved && !references.length) continue;
			ixConflict(context, references.length ? 'section-delete-reference' : 'section-delete-edit', ['sections', id], ...values, references.length ? {noteIDs: references} : {});
			kept.set(id, live);
		} else kept.set(id, ixFields(context, ...values, ['sections', id]));
	}
	// Section uniqueness folds case, but card placement requires the exact display name.
	for (const [file, entry] of Object.entries(notes)) {
		const category = entry.category, section = typeof category === 'string' ? kept.get(category.toLowerCase()) : null;
		if (!section || section.name === category || !noteMaps.some((map, i) => map.get(entry.id)?.category === category && lists[i].some(s => s.name === category))) continue;
		ixConflict(context, 'section-category-spelling', ['notes', entry.id, 'category'], ...noteMaps.map(map => ixGet(map.get(entry.id), 'category')), {section: section.name});
		ixPut(notes, file, {...entry, category: section.name});
	}
	const ids = [...kept.keys()], edges = new Map(ids.map(id => [id, new Set()]));
	for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
		const a = ids[i], b = ids[j], relations = keys.map(list => relation(list, a, b));
		let choice;
		if (relations[1] === IX_MISSING) choice = relations[2];
		else if (relations[2] === IX_MISSING) choice = relations[1];
		else choice = ixField(context, ...relations, ['sections', a, b], 'section-order');
		if (choice !== IX_MISSING) edges.get(choice ? a : b).add(choice ? b : a);
	}
	const ordered = [], pending = new Set(ids);
	let cycle = false;
	while (pending.size) {
		const ready = [...pending].filter(id => ![...pending].some(other => edges.get(other).has(id))).sort();
		let chosen = ready[0];
		if (chosen === undefined) {
			cycle = true;
			const priority = ixDevices(context)[0] < ixDevices(context)[1] ? 1 : 2;
			chosen = keys[priority].find(id => pending.has(id)) || [...pending].sort()[0];
		}
		ordered.push(kept.get(chosen)); pending.delete(chosen);
	}
	if (cycle) ixConflict(context, 'section-order-cycle', ['sections'], ...lists);
	return ordered;
}

const ixFileKey = file => file.normalize('NFC').toLowerCase();
function ixSafeName(file, id, occupied) {
	// A code file keeps its own extension through a collision; a note is Markdown.
	const ext = isCodeFile(file) ? file.slice(file.lastIndexOf('.')) : '.md';
	let stem = Array.from(file.slice(0, -ext.length).replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ').replace(/[ .]+$/g, '')).slice(0, 80).join('') || 'note';
	if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(stem)) stem = 'note-' + stem;
	const tag = id.replace(/[^A-Za-z0-9_-]/g, '-');
	let candidate = stem + ' (' + tag + ')' + ext, n = 2;
	while (occupied.has(ixFileKey(candidate))) candidate = stem + ' (' + tag + '-' + n++ + ')' + ext;
	return candidate;
}

// One allocator for index merge and Sync's already-merged per-ID sidecars.
export function assignNoteFilenames(notes, reservedNames = []) {
	const reserved = new Set([...notes.map(note => ixFileKey(note.file)), ...reservedNames.map(ixFileKey)]), occupied = new Set(reservedNames.map(ixFileKey));
	return notes.slice().sort((a, b) => ixCompare(a.entry.id, b.entry.id)).map(note => {
		const file = occupied.has(ixFileKey(note.file)) ? ixSafeName(note.file, note.entry.id, new Set([...reserved, ...occupied])) : note.file;
		occupied.add(ixFileKey(file)); return {...note, file, requested: note.file};
	});
}

export function mergeIndex(base, ours, theirs, options = {}) {
	for (const index of [base, ours, theirs]) if (index !== null) ixValidate(index, true);
	if (!ours || !theirs) ixFail('two complete index snapshots required');
	if (!ixRecord(options)) ixFail('invalid merge options');
	if (options.changedNoteIDs !== undefined && (!ixRecord(options.changedNoteIDs) || Object.values(options.changedNoteIDs).some(ids => !Array.isArray(ids) || ids.some(id => !ixID(id))))) ixFail('invalid content-change evidence');
	if (options.mergedRevisions !== undefined && (!ixRecord(options.mergedRevisions) || Object.entries(options.mergedRevisions).some(([id, revision]) => !ixID(id) || typeof revision !== 'string' || !revision))) ixFail('invalid merged content revisions');
	const context = {options, conflicts: []}, indexes = [base, ours, theirs];
	const out = ixFields(context, base ?? IX_MISSING, ours, theirs, [], ['notes', 'sections', 'collapsed', 'tombstones', 'conflicts']);
	const tombstones = ixTombstones(context, indexes);
	if (Object.keys(tombstones).length || indexes.some(index => index && ixOwn(index, 'tombstones'))) out.tombstones = tombstones;
	const maps = indexes.map(index => new Map(Object.entries(index?.notes || {}).map(([file, entry]) => [entry.id, {file, entry}]))), merged = [];
	for (const id of [...new Set(maps.flatMap(map => [...map.keys()]))].sort()) {
		const values = maps.map(map => map.get(id) ?? IX_MISSING), [ancestor, a, b] = values;
		if (a === IX_MISSING && b === IX_MISSING) {
			const records = [...ixNewDeletes(base, ours, id), ...ixNewDeletes(base, theirs, id)];
			if (ancestor !== IX_MISSING && !ixDeleteCovers(records, ancestor)) {
				ixConflict(context, records.length ? 'delete-content-unproven' : 'missing-entry', ['notes', id], ancestor, a, b);
				merged.push({file: ancestor.file, entry: {...ancestor.entry, trashed: false, archived: false}});
			}
			continue;
		}
		if (a !== IX_MISSING && b !== IX_MISSING) { merged.push(ixMergeEntry(context, ...values, id)); continue; }
		const i = a === IX_MISSING ? 2 : 1, live = values[i], absent = indexes[i === 1 ? 2 : 1];
		const records = ixNewDeletes(base, absent, id), deletion = records.length > 0, changed = ixChanged(context, ancestor, live, i === 1 ? 'ours' : 'theirs');
		if (ancestor !== IX_MISSING && ixDeleteCovers(records, live) && changed === false) continue;
		if (ancestor !== IX_MISSING || deletion) {
			ixConflict(context, !deletion ? 'missing-entry' : changed === null ? 'delete-change-unknown' : changed ? 'delete-edit' : 'delete-content-unproven', ['notes', id], ...values);
			merged.push({file: live.file, entry: {...live.entry, trashed: false, archived: false}});
		} else merged.push(live);
	}
	out.notes = {};
	for (const note of assignNoteFilenames(merged)) {
		if (note.file !== note.requested) ixConflict(context, 'filename-collision', ['notes', note.entry.id, 'file'], ...maps.map(map => map.get(note.entry.id) ?? IX_MISSING), {noteID: note.entry.id, assigned: note.file});
		ixPut(out.notes, note.file, note.entry);
	}
	if (indexes.some(index => index && ixOwn(index, 'sections'))) out.sections = ixSections(context, indexes, out.notes);
	if (indexes.some(index => index && ixOwn(index, 'collapsed'))) out.collapsed = ixFields(context, ...indexes.map(index => index?.collapsed || IX_MISSING), ['collapsed']);
	// An unresolved alternative remains durable even if a caller forgets the separate return value.
	const ledger = new Map(indexes.flatMap(index => index?.conflicts || []).concat(context.conflicts).map(conflict => [ixJSON(conflict), conflict]));
	const conflicts = [...ledger.entries()].sort(([a], [b]) => ixCompare(a, b)).map(([, value]) => value);
	if (conflicts.length || indexes.some(index => index && ixOwn(index, 'conflicts'))) out.conflicts = conflicts;
	const index = ixClone(out);
	return {index, clean: !conflicts.length, conflicts: index.conflicts || []};
}
