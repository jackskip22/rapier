// SPDX-License-Identifier: MIT
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

const TEXT_WINDOW_CELLS = 1000000, TEXT_CELLS = 4000000;
function textWindowMatches(base, side, b0, b1, s0, s1, out, budget) {
	const n = b1 - b0, m = s1 - s0, cells = (n + 1) * (m + 1);
	if (cells > TEXT_WINDOW_CELLS || (budget.cells -= cells) < 0) return false;
	const width = m + 1, score = new Uint32Array(cells), content = i => !textSpace(base[b0 + i]), same = (i, j) => base[b0 + i] === side[s0 + j];
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
		const p = i * width + j;
		score[p] = content(i) && same(i, j) ? score[p + width + 1] + 1 : Math.max(score[p + width], score[p + 1]);
	}
	const meaningful = [];
	for (let i = 0, j = 0; i < n && j < m;) {
		const p = i * width + j; if (!score[p]) break;
		if (content(i) && same(i, j) && score[p] === score[p + width + 1] + 1) meaningful.push([i++, j++]);
		else if (score[p + width] >= score[p + 1]) i++; else j++;
	}
	const seen = new Uint32Array(cells); seen.fill(0xffffffff); seen[0] = 0;
	for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
		const p = i * width + j, at = seen[p]; if (at === 0xffffffff) continue;
		const visit = (next, count) => { if (seen[next] !== 0xffffffff && seen[next] !== count) return false; seen[next] = count; return true; };
		if (i < n && score[p + width] === score[p] && !visit(p + width, at)) return false;
		if (j < m && score[p + 1] === score[p] && !visit(p + 1, at)) return false;
		if (i < n && j < m && content(i) && same(i, j) && score[p] === score[p + width + 1] + 1) {
			if (meaningful[at]?.[0] !== i || meaningful[at]?.[1] !== j) return false;
			if (!visit(p + width + 1, at + 1)) return false;
		}
	}
	if (seen[n * width + m] !== meaningful.length) return false;
	for (const [i, j] of meaningful) out.push([b0 + i, s0 + j]);
	return true;
}

function textMatches(base, side, b0, b1, s0, s1, out, budget) {
	if ((b1 - b0 + 1) * (s1 - s0 + 1) <= TEXT_WINDOW_CELLS) return textWindowMatches(base, side, b0, b1, s0, s1, out, budget);
	const once = (units, from, to) => {
		const found = new Map();
		for (let k = from; k < to; k++) if (!textSpace(units[k])) found.set(units[k], found.has(units[k]) ? -1 : k);
		return found;
	};
	const inBase = once(base, b0, b1), pairs = [];
	for (const [unit, j] of once(side, s0, s1)) { const i = inBase.get(unit); if (j >= 0 && i >= 0) pairs.push([i, j]); }
	const tails = [], prev = new Int32Array(pairs.length);
	for (let k = 0; k < pairs.length; k++) {
		let lo = 0, hi = tails.length;
		while (lo < hi) { const mid = (lo + hi) >>> 1; if (pairs[tails[mid]][0] < pairs[k][0]) lo = mid + 1; else hi = mid; }
		prev[k] = lo ? tails[lo - 1] : -1; tails[lo] = k;
	}
	if (!tails.length) return false;
	const chain = [];
	for (let k = tails[tails.length - 1]; k >= 0; k = prev[k]) chain.push(pairs[k]);
	let i = b0, j = s0;
	for (const [bi, sj] of chain.reverse()) {
		if (!textMatches(base, side, i, bi, j, sj, out, budget)) return false;
		out.push([bi, sj]); i = bi + 1; j = sj + 1;
	}
	return textMatches(base, side, i, b1, j, s1, out, budget);
}

function textEdits(base, side) {
	const n = base.length, m = side.length, meaningful = [];
	if (!textMatches(base, side, 0, n, 0, m, meaningful, {cells: TEXT_CELLS})) return null;
	const pairs = [];
	let i = 0, j = 0;
	for (let k = 0; k < meaningful.length; k++) {
		const [bi, sj] = meaningful[k], [ni, nj] = meaningful[k + 1] || [n, m];
		if (bi > i && sj > j && textSpace(base[bi - 1]) && base[bi - 1] === side[sj - 1]) pairs.push([bi - 1, sj - 1]);
		pairs.push([bi, sj]); i = bi + 1; j = sj + 1;
		if (i < ni && j < nj && textSpace(base[i]) && base[i] === side[j]) pairs.push([i++, j++]);
	}
	const edits = []; i = 0; j = 0;
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

function textDeclarations(units) {
	const kept = units.filter(unit => !textEnvelopeAt(unit)).map(unit =>
		textFence(unit.split(/\r\n|\r|\n/, 1)[0].replace(/^\ufeff/, '')) ? '\n' : unit), text = kept.join('');
	const definitions = text.match(/^\ufeff? {0,3}\[(?:\\.|[^\]\\])+\]:[^\r\n]*(?:(?:\r\n|\r|\n)(?![ 	]*(?:\r\n|\r|\n|$))[^\r\n]*)*/gm) || [];
	const continuations = (kept.length === units.length ? kept : textUnits(text)).filter(unit => /^\ufeff? {0,3}\[\^/.test(unit));
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
	const [units, oursUnits, theirsUnits] = base === null ? [] : [base, ours, theirs].map(textUnits);
	const declared = base !== null && textDeclarations(units);
	if (base === null) conflict(null, ours, theirs, 'no-ancestor');
	else if (textDeclarations(oursUnits) !== declared || textDeclarations(theirsUnits) !== declared) conflict(base, ours, theirs, 'document-bindings');
	else {
		const a = textEdits(units, oursUnits), b = textEdits(units, theirsUnits);
		if (!a || !b) conflict(base, ours, theirs, 'ambiguous-alignment-or-budget');
		else {
			const changes = [...a.map(e => ({...e, side: 0})), ...b.map(e => ({...e, side: 1}))].sort((x, y) => x.start - y.start || x.end - y.end || x.side - y.side);
			let pos = 0;
			for (let i = 0; i < changes.length;) {
				const group = [changes[i++]], start = group[0].start; let end = group[0].end;
				while (i < changes.length && (changes[i].start < end || group.some(e => {
					const next = changes[i];
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

