// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Typing that makes its own blocks (docs/formatting-algebra.md): the marker a person types at a
 * line's start, read as the block they expect, and a mark they have just closed, read as that mark.
 * Pure: the words before the caret in, a decision out. No DOM, no history, no second grammar. Every
 * prefix returned is CommonMark or GFM and is spelled as it was typed; the one exception is the
 * task item, whose only Markdown is `- [ ] `.
 *
 * `before` is the block's (or the item's) words from its start to the caret. `key` is 'space'
 * (the space just typed is the last character of `before`) or 'enter' (the caret is at the end and
 * Enter was pressed). `where` is 'paragraph' (a plain paragraph block) or 'item' (a bullet item
 * that is not yet a task).
 *
 * Every paragraph decision carries `literal`: the same characters escaped, so a paragraph that shows
 * them reads as that paragraph in every Markdown reader -- the source one Undo returns to.
 */
function _rapierTypedBlock(before, key, where) {
	const text = String(before == null ? '' : before).replace(/\u00a0/g, ' ');
	if (where === 'item') {
		const task = key === 'space' && /^\[([ xX]?)\] $/.exec(text);
		return task ? { kind: 'task-item', checked: /x/i.test(task[1]) } : null;
	}
	if (where !== 'paragraph') return null;
	if (key === 'space') {
		// Three digits at most: "1984. That year" is a sentence, not a list's 1984th item.
		if (/^\d{1,3}[.)] $/.test(text)) return { kind: 'ol', prefix: text, literal: text.slice(0, -2) + '\\' + text.slice(-2) };
		if (/^[-*+] $/.test(text)) return { kind: 'ul', prefix: text, literal: '\\' + text };
		const task = /^\[([ xX]?)\] $/.exec(text);
		if (task) return { kind: 'task', prefix: '- [' + (/x/i.test(task[1]) ? 'x' : ' ') + '] ', literal: '\\[' + task[1] + '\\] ' };
		if (text === '> ') return { kind: 'quote', prefix: text, literal: '\\' + text };
		if (/^#{1,6} $/.test(text)) return { kind: 'heading', prefix: text, literal: '\\' + text };
		return null;
	}
	if (key === 'enter') {
		const escaped = text.split('').map(character => /[-*_`~\\[\]<&]/.test(character) ? '\\' + character : character).join('');
		if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(text)) return { kind: 'divider', raw: text, literal: text[0] === '-' ? '\\' + text : escaped };
		const fence = /^(`{3,})([^`\s]*)$/.exec(text);
		if (fence) return { kind: 'fence', raw: text + '\n' + fence[1], literal: escaped };
	}
	return null;
}

// A mark closed just before the boundary the person typed (a space, punctuation or Enter, as Word
// waits for): `before` is the text node's words up to, not including, that boundary. Only a run wholly
// inside those words, opened after the line's start, a space or an opening bracket or quote, with no
// other mark character inside it, is read -- the runs every CommonMark reader reads the same way.
// A link `[words](address)` is read the same way: its address holds no space or angle bracket and its
// parentheses pair (CommonMark's own rule, so the closing one is never a guess), and it is a web, mail or
// relative address. Strikethrough, `==`, `++` and a single `~` are not: a typed tilde is written escaped,
// as a typed star is, and stays characters, because `~x~` is subscript here and strikethrough in GFM;
// another reader shows `==` and `++` as they are.
const _RAPIER_TYPED_MARKS = Object.freeze([['**', 'strong'], ['__', 'strong'], ['*', 'em'], ['_', 'em'], ['`', 'code']]);
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
	if (!/^[\s.,;:!?)\]}"'\u2019\u201d]$/.test(String(boundary || ''))) return null;
	const text = String(before == null ? '' : before);
	const link = _rapierTypedLink(text);
	if (link) return link;
	for (const [delim, kind] of _RAPIER_TYPED_MARKS) {
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

// A tilde a person types is written escaped (`\~`, by the editor's writer, as a typed star is); a
// tilde the block's source already held keeps its own spelling where the words around it did not
// change, so another app's `~underlined phrase~` (Bear's underline) survives an edit beside it.
// `before` is the block's source with LF breaks, `after` the writer's; the caller keeps the result
// only when it reads as `after` does.
function _rapierKeepSourceTildes(before, after) {
	const previous = String(before == null ? '' : before);
	const written = String(after == null ? '' : after);
	if (!previous.includes('~') || !written.includes('\\~')) return written;
	// The written source with its tilde escapes lifted, and where each lifted character starts in it.
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

// An empty task keeps the space after its box: GitHub's reader takes `- [ ]` alone for the words "[ ]"
// and `- [ ] ` for an empty task. The writers trim a block's Markdown, which takes that space; this
// gives it back to every line that is only a task's marker, outside a fence (a fenced line is code).
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
