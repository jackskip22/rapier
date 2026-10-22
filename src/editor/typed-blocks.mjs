// SPDX-License-Identifier: AGPL-3.0-only

function _rapierTypedBlock(before, key, where) {
	const text = String(before == null ? '' : before).replace(/\u00a0/g, ' ');
	if (where === 'item') {
		const task = key === 'space' && /^\[([ xX]?)\] $/.exec(text);
		return task ? { kind: 'task-item', checked: /x/i.test(task[1]) } : null;
	}
	if (where !== 'paragraph') return null;
	if (key === 'space') {
		if (/^\d{1,9}[.)] $/.test(text)) return { kind: 'ol', prefix: text, literal: text.slice(0, -2) + '\\' + text.slice(-2) };
		if (/^[-*+] $/.test(text)) return { kind: 'ul', prefix: text, literal: '\\' + text };
		const task = /^([-*+] )?\[([ xX]?)\] $/.exec(text);
		if (task) return { kind: 'task', prefix: (task[1] || '- ') + '[' + (/x/i.test(task[2]) ? 'x' : ' ') + '] ',
			literal: (task[1] ? '\\' + task[1] : '') + '\\[' + task[2] + '\\] ' };
		if (text === '> ') return { kind: 'quote', prefix: text, literal: '\\' + text };
		if (/^#{1,6} $/.test(text)) return { kind: 'heading', prefix: text, literal: '\\' + text };
		return null;
	}
	if (key === 'enter') {
		const escaped = text.split('').map(character => /[-*_`~\\[\]<&]/.test(character) ? '\\' + character : character).join('');
		if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(text)) return { kind: 'divider', raw: text, literal: text[0] === '-' ? '\\' + text : escaped };
		const fence = /^(`{3,})([^`\s]*)$/.exec(text) || /^(~{3,})(\S*)$/.exec(text);
		if (fence) return { kind: 'fence', raw: text + '\n' + fence[1], literal: escaped };
	}
	return null;
}

const _RAPIER_TYPED_MARKS = Object.freeze([['**', 'strong'], ['__', 'strong'], ['~~', 's'], ['*', 'em'], ['_', 'em'], ['`', 'code']]);
const _RAPIER_TYPED_OPENER = /[\s(\[{"'\u2018\u201c]/;

function _rapierTypedLink(text) {
	if (!text.endsWith(')')) return null;
	let depth = 0, open = -1;
	for (let at = text.length - 1; at >= 0; at--) {
		if (text[at] === ')') depth++;
		else if (text[at] === '(' && --depth === 0) { open = at; break; }
	}
	if (open < 2 || text[open - 1] !== ']') return null;
	const href = text.slice(open + 1, -1);
	if (!href || /[\s<>\\]/.test(href) || (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^(?:https?:\/\/|mailto:)[^/]/i.test(href))) return null;
	const start = text.lastIndexOf('[', open - 2);
	if (start < 0) return null;
	const inner = text.slice(start + 1, open - 1);
	if (!inner || /[[\]*_~`<>&\\]/.test(inner) || /^\s|\s$/.test(inner)) return null;
	if (start > 0 && !_RAPIER_TYPED_OPENER.test(text[start - 1])) return null;
	return { kind: 'a', delim: '', start, inner, href };
}

function _rapierTypedMark(before, boundary) {
	if (boundary && !/^[\s.,;:!?)\]}"'\u2019\u201d]$/.test(String(boundary))) return null;
	const text = String(before == null ? '' : before);
	const link = boundary ? _rapierTypedLink(text) : null;
	if (link) return link;
	for (const [delim, kind] of _RAPIER_TYPED_MARKS) {
		if (!boundary && delim[0] === '_') continue;
		if (!text.endsWith(delim)) continue;
		const close = text.length - delim.length;
		if (close < 1 || text[close - 1] === delim[0] || /\s/.test(text[close - 1])) continue;
		const open = text.lastIndexOf(delim, close - 1);
		if (open < 0) continue;
		const inner = text.slice(open + delim.length, close);
		if (!inner || /\s/.test(inner[0]) || /[*_~`]/.test(inner)) continue;
		if (open > 0 && !_RAPIER_TYPED_OPENER.test(text[open - 1])) continue;
		return { kind, delim, start: open, inner };
	}
	return null;
}

function _rapierKeepSourceTildes(before, after) {
	const previous = String(before == null ? '' : before);
	const written = String(after == null ? '' : after);
	if (!previous.includes('~') || !written.includes('\\~')) return written;
	let lifted = '';
	const starts = [];
	for (let index = 0; index < written.length; index++) {
		starts.push(index);
		if (written[index] === '\\' && index + 1 < written.length) {
			if (written[index + 1] === '~') { lifted += '~'; index++; continue; }
			lifted += '\\';
			starts.push(++index);
			lifted += written[index];
			continue;
		}
		lifted += written[index];
	}
	starts.push(written.length);
	const limit = Math.min(previous.length, lifted.length);
	let head = 0;
	while (head < limit && previous[head] === lifted[head]) head++;
	let tail = 0;
	while (tail < limit - head && previous[previous.length - 1 - tail] === lifted[lifted.length - 1 - tail]) tail++;
	if (!head && !tail) return written;
	return previous.slice(0, head) + written.slice(starts[head], starts[lifted.length - tail]) +
		previous.slice(previous.length - tail);
}

function _rapierEmptyTaskSpace(markdown) {
	const text = String(markdown == null ? '' : markdown);
	if (!/\[[ xX]\]$/m.test(text)) return text;
	let fence = null;
	return text.split('\n').map(line => {
		const opener = /^[ \t]*(`{3,}|~{3,})/.exec(line);
		if (opener && (!fence || (opener[1][0] === fence[0] && opener[1].length >= fence.length))) {
			fence = fence ? null : opener[1];
			return line;
		}
		return !fence && /^[ \t]*(?:[-*+]|\d{1,9}[.)]) \[[ xX]\]$/.test(line) ? line + ' ' : line;
	}).join('\n');
}

export { _rapierTypedBlock, _rapierTypedMark, _rapierKeepSourceTildes, _rapierEmptyTaskSpace };
