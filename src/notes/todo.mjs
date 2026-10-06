import {markdownParser} from '../spec/md-assets.mjs';
import {splitOpeningFrontmatter, frontMatterLine} from '../spec/frontmatter.mjs';
import {cardSource} from './model.mjs';

// Pure to-do model over the note's own lines. A checklist owns its root and one nested level;
// all rewrites preserve markers, labels and line endings that the person did not change.

// null when not a bullet line; the line ending is kept.
function parseLine(line) {
	const body = String(line ?? '').replace(/^\uFEFF/, '');
	const cr = body.endsWith('\r') ? '\r' : '';
	const rest = cr ? body.slice(0, -1) : body;
	let m = /^(\s*)([-*])\s+\[( |x|X)\]\s?(.*)$/.exec(rest);
	if (m) return {indent: m[1], marker: m[2], boxed: true, done: m[3] !== ' ', label: m[4], cr};
	m = /^(\s*)([-*])\s+(.*)$/.exec(rest);
	if (m) return {indent: m[1], marker: m[2], boxed: false, done: false, label: m[3], cr};
	return null;
}

// Any item in a checklist finds its whole Markdown list, including continuation paragraphs.
export function listAt(text, lineIndex) {
	const source = checklistSource(text), {lines} = source, i = Number(lineIndex);
	if (!Number.isInteger(i) || i < 0 || i >= lines.length) return null;
	const seed = parseLine(lines[i]); if (!seed) return null;
	if (seed.boxed) {
		const list = source.lists.find(row => row.start === row.root && row.start <= i && i < row.end);
		if (!list) return null;
		const rows = source.items.filter(item => item.root === list.start);
		if (!rows.length || rows.some(item => !item.task || !/^(?:  )?$/.test(item.parsed.indent))) return null;
		let end = list.end; while (end > list.start && !lines[end - 1]?.trim()) end--;
		return {start: list.start, end, boxed: true, items: rows.map(item => ({line: item.line, end: item.end, indent: item.parsed.indent, depth: item.parsed.indent ? 1 : 0, marker: item.parsed.marker, done: item.parsed.done, label: item.parsed.label}))};
	}
	const matches = j => { const p = parseLine(lines[j]); return !!p && !p.boxed && p.indent === seed.indent; };
	let start = i, end = i + 1;
	while (start > 0 && matches(start - 1)) start--;
	while (end < lines.length && matches(end)) end++;
	const items = [];
	for (let j = start; j < end; j++) { const p = parseLine(lines[j]); items.push({line: j, indent: p.indent, depth: 0, marker: p.marker, done: false, label: p.label}); }
	return {start, end, boxed: false, items};
}

// Explicit edits use the Markdown grammar, not the deliberately conservative card preview.
// Thus an HTML block or a quoted fence elsewhere never disables a real checklist. Conflicted
// notes still refuse edits until reviewed. Source pieces retain every original line ending.
function checklistSource(text) {
	const source = cardSource(text), raw = String(text ?? ''), items = [], lists = [], tasks = [];
	if (source.needsReview) return {...source, items, lists, tasks};
	const bodyStart = splitOpeningFrontmatter(raw).bodyOffset || (raw.startsWith('\uFEFF') ? 1 : 0);
	const offset = (raw.slice(0, bodyStart).match(/\r\n|\r|\n/g) || []).length;
	const listStack = [], itemStack = [];
	for (const token of markdownParser().parse(raw.slice(bodyStart), {})) {
		if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
			const [start, end] = token.map.map(line => line + offset), row = {start, end, root: listStack[0]?.root ?? start};
			lists.push(row); listStack.push(row);
		} else if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') listStack.pop();
		else if (token.type === 'list_item_open') {
			const [line, end] = token.map.map(at => at + offset), rawLine = source.lines[line].replace(/^\uFEFF/, '');
			const task = /^([ \t]*)([-*][ \t]+\[)( |x|X)(\](?:[ \t].*)?)$/.exec(rawLine);
			const item = {line, end, task, indent: checklistIndent(rawLine), parsed: parseLine(rawLine), list: listStack.at(-1)?.start, root: listStack[0]?.root, parent: itemStack.at(-1)?.line ?? null};
			items.push(item); itemStack.push(item); if (task) tasks[line] = task;
		} else if (token.type === 'list_item_close') itemStack.pop();
	}
	return {...source, items, lists, tasks};
}
function checklistIndent(line) {
	let width = 0;
	for (const char of /^[ \t]*/.exec(line)[0]) width += char === '\t' ? 4 - width % 4 : 1;
	return width;
}
function checklistOutdent(line, width) {
	let at = 0, removed = 0;
	while (at < line.length && removed < width && /[ \t]/.test(line[at])) { removed += line[at++] === '\t' ? 4 - removed % 4 : 1; }
	return ' '.repeat(Math.max(0, removed - width)) + line.slice(at);
}
export function hasChecks(text) { return checklistSource(text).tasks.some(Boolean); }
export function uncheckAll(text) {
	const {pieces, tasks} = checklistSource(text);
	for (let i = 0; i < pieces.length; i++) if (tasks[i] && tasks[i][3] !== ' ') {
		const at = tasks[i][1].length + tasks[i][2].length + (pieces[i].startsWith('\uFEFF') ? 1 : 0);
		pieces[i] = pieces[i].slice(0, at) + ' ' + pieces[i].slice(at + 1);
	}
	return pieces.join('');
}
export function deleteChecked(text) {
	const {pieces, items} = checklistSource(text), removed = new Set(), promoted = new Map(), byLine = new Map(items.map(item => [item.line, item]));
	for (const item of items) {
		const checked = item.task && item.task[3] !== ' ', orphan = removed.has(item.line) && !checked;
		let shift = promoted.get(item.line) || 0;
		if (orphan) {
			let outer = item;
			for (let parent = byLine.get(item.parent); parent?.task && parent.task[3] !== ' '; parent = byLine.get(parent.parent)) outer = parent;
			shift += item.indent - outer.indent;
		}
		for (let line = item.line; line < item.end; line++) {
			if (checked) removed.add(line);
			else if (orphan) { removed.delete(line); promoted.set(line, shift); }
		}
	}
	for (let i = 0; i < pieces.length; i++) if (removed.has(i)) pieces[i] = ''; else if (promoted.has(i)) pieces[i] = checklistOutdent(pieces[i], promoted.get(i));
	const next = pieces.join('');
	return String(text ?? '').startsWith('\uFEFF') && !next.startsWith('\uFEFF') ? '\uFEFF' + next : next;
}
export function indentItem(text, line, indent) {
	const {pieces, items} = checklistSource(text), item = items.find(row => row.line === line);
	if (!Number.isInteger(line) || !item?.task) return null;
	if (indent) {
		const siblings = items.filter(row => row.list === item.list), previous = siblings[siblings.indexOf(item) - 1];
		// A root with children cannot itself become a child: that would author a third level.
		if (item.parsed.indent || !previous?.task || items.some(row => row.parent === line)) return null;
	} else if (item.parsed.indent !== '  ') return null;
	for (let i = item.line; i < item.end; i++) {
		if (!pieces[i].trim()) continue;
		const signature = pieces[i].startsWith('\uFEFF') ? '\uFEFF' : '', part = pieces[i].slice(signature.length);
		pieces[i] = signature + (indent ? '  ' + part : part.replace(/^ {2}/, ''));
	}
	return pieces.join('');
}

// Source offsets name siblings; the Markdown item range carries its children and paragraphs.
export function moveItem(text, range, from, to) {
	if (!range || range.boxed !== true || !Number.isInteger(from) || !Number.isInteger(to) || from === to) return null;
	const source = checklistSource(text), {pieces, items} = source;
	const item = items.find(row => row.line === range.start + from), target = items.find(row => row.line === range.start + to);
	if (!item?.task || !target?.task || item.list !== target.list || item.line < range.start || target.line < range.start || item.line >= range.end || target.line >= range.end) return null;
	const signature = pieces[0]?.startsWith('\uFEFF'); if (signature) pieces[0] = pieces[0].slice(1);
	const siblings = items.filter(row => row.list === item.list);
	const slots = siblings.map(row => {
		let end = row.end; while (end > row.line && !source.lines[end - 1]?.trim()) end--;
		return {body: pieces.slice(row.line, end), gap: pieces.slice(end, row.end), ending: /(?:\r\n|\r|\n)$/.exec(pieces[end - 1])?.[0] || ''};
	});
	// Blank separators and the terminal newline belong to their positions, not the moved
	// item. Otherwise moving a loose first item to the end can invent a final newline.
	const bodies = slots.map(slot => slot.body), [moved] = bodies.splice(siblings.indexOf(item), 1);
	bodies.splice(siblings.indexOf(target), 0, moved);
	const replacement = slots.flatMap((slot, i) => {
		const body = bodies[i].slice(); body[body.length - 1] = body.at(-1).replace(/(?:\r\n|\r|\n)$/, '') + slot.ending;
		return [...body, ...slot.gap];
	});
	pieces.splice(siblings[0].line, siblings.at(-1).end - siblings[0].line, ...replacement);
	if (signature) pieces[0] = '\uFEFF' + pieces[0];
	return pieces.join('');
}

// Marker, indent and ending match the first item.
function appendLine(text, range, value) {
	if (!range || range.boxed !== true) return null;
	const start = Number(range.start), end = Number(range.end);
	if (!(Number.isInteger(start) && Number.isInteger(end) && end >= start)) return null;
	const raw = String(text ?? ''), {pieces, lines} = cardSource(raw);
	const seed = end > start ? parseLine(lines[start]) : null;
	const indent = seed?.indent ?? '', marker = seed?.marker ?? '-', eol = /\r\n|\r|\n/.exec(pieces[start] || raw)?.[0] || '\n';
	const ending = end < pieces.length || !raw || /(?:\r\n|\r|\n)$/.test(raw) ? eol : '';
	if (end > 0 && !/(?:\r\n|\r|\n)$/.test(pieces[end - 1])) pieces[end - 1] += eol;
	// An empty task keeps the space after its box, the one spelling GitHub reads as a task (`- [ ] `; `- [ ]` is the
	// words "[ ]"): the same line the editor gives back through _rapierEmptyTaskSpace (editor/typed-blocks.mjs, engine
	// code the runtime does not publish), and the cell empty-task-space in formatting-table-exact holds the two to it.
	pieces.splice(end, 0, indent + marker + ' [ ] ' + value + ending);
	return pieces.join('');
}
// A blank label is refused.
export function appendItem(text, range, label) {
	const value = String(label ?? '').trim();
	if (!value) return null;
	return appendLine(text, range, value);
}
// "+ LIST ITEM": a real empty item the caret goes into (notes/todo.js _rapierTodoAddItem). Not appendItem(''), which refuses blanks.
export function appendEmptyItem(text, range) { return appendLine(text, range, ''); }

// Boxes go, items stay on their lines. The other half is boxNote.
export function hideBoxes(text, range) {
	if (!range || range.boxed !== true) return null;
	const start = Number(range.start), end = Number(range.end);
	if (!(Number.isInteger(start) && Number.isInteger(end) && end > start)) return null;
	const {pieces, items} = checklistSource(text), rows = items.filter(item => item.line >= start && item.line < end);
	if (!rows.length || rows.some(item => !item.task)) return null;
	for (let i = start; i < end; i++) {
		const owner = rows.findLast(item => item.line <= i && i < item.end); if (!owner) continue;
		if (owner.line === i) {
			const ending = /(?:\r\n|\r|\n)$/.exec(pieces[i])?.[0] || '', signature = pieces[i].startsWith('\uFEFF') ? '\uFEFF' : '';
			pieces[i] = signature + owner.parsed.label + ending;
		} else if (pieces[i].trim()) pieces[i] = checklistOutdent(pieces[i], owner.indent + 2);
	}
	return pieces.join('');
}

// Every line comes back unchecked: prior state is gone.
export function showBoxes(text, range) {
	if (!range || range.boxed !== false) return null;
	const start = Number(range.start), end = Number(range.end);
	if (!(Number.isInteger(start) && Number.isInteger(end) && end > start)) return null;
	const lines = String(text ?? '').split('\n');
	for (let i = start; i < end; i++) {
		const p = parseLine(lines[i]);
		if (!p || p.boxed) return null;
		lines[i] = p.indent + p.marker + ' [ ] ' + p.label + p.cr;
	}
	return lines.join('\n');
}

// Plain body lines become unchecked items in place; headings, quotes, tables, pictures, lists and fences untouched. An empty or unconvertible
// note gets one box. "- [ ] " is right: _rapierTodoEnsureLabel (notes/todo.js) fixes the caret, never invent a word.
export function boxNote(text) {
	const raw = String(text ?? '');
	if (!raw.trim()) return '- [ ] \n';
	const start = splitOpeningFrontmatter(raw).bodyOffset || (raw[0] === '\uFEFF' ? 1 : 0);
	const body = raw.slice(start), eol = /\r\n|\r|\n/.exec(raw)?.[0] || '\n';
	const md = markdownParser(), rows = [], edits = [];
	for (let at = 0; at < body.length;) { const row = frontMatterLine(body, at); rows.push(row); at = row.next; }
	// A one-line paragraph with blocks under it is the title: no box. A note that is only the list has none.
	const tokens = md.parse(body, {});
	const blocks = tokens.filter(token => token.type === 'paragraph_open' && token.level === 0 && token.map);
	const titleLine = blocks.length > 1 && blocks[0].map[1] - blocks[0].map[0] === 1 ? blocks[0].map[0] : -1;
	let convertedParagraph = false;
	for (const token of tokens) {
		if (token.level !== 0 || token.nesting < 0 || !token.map) continue;
		if (titleLine >= 0 && token.type === 'paragraph_open' && token.map[0] === titleLine) { convertedParagraph = false; continue; }
		// Otherwise a new list absorbs a following indented code block as its own paragraph.
		if (token.type === 'code_block' && convertedParagraph)
			edits.push({at: rows[token.map[0]].start, text: '<!-- -->' + eol + eol});
		convertedParagraph = false;
		if (token.type !== 'paragraph_open') continue;
		for (let i = token.map[0]; i < token.map[1]; i++) {
			const row = rows[i], line = row.text;
			if (!line.trim() || /^\s*(#|>|\||!\[|<|\d+[.)]\s|[-*+](\s|$)|_{3,}|={3,}\s*$)/.test(line)) continue;
			edits.push({at: row.start + /^[ \t]*/.exec(line)[0].length, text: '- [ ] '});
			convertedParagraph = true;
		}
	}
	if (edits.length) {
		let out = body;
		for (const edit of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, edit.at) + edit.text + out.slice(edit.at);
		return raw.slice(0, start) + out;
	}
	const gap = !body || body.endsWith(eol + eol) ? '' : body.endsWith(eol) ? eol : eol + eol;
	const prefix = raw + (start && !body && !/[\r\n\uFEFF]$/.test(raw) ? eol : '') + gap;
	const appended = prefix + '- [ ] ' + eol;
	const row = prefix.slice(start).split(/\r\n|\r|\n/).length - 1;
	if (md.parse(appended.slice(start), {}).some(t => t.type === 'bullet_list_open' && t.level === 0 && t.map?.[0] === row)) return appended;
	// An unfinished fence or HTML block must not swallow the first checkbox. Keep YAML first.
	const head = raw.slice(0, start);
	return head + (head && !/[\r\n\uFEFF]$/.test(head) ? eol : '') + '- [ ] ' + eol + eol + body;
}

// Display grouping only; never a rewrite.
export function partition(items) {
	const open = [], ticked = [];
	for (const item of (items || [])) (item && item.done ? ticked : open).push(item);
	return {open, ticked};
}
