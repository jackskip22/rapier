// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import parseCSS from './vendor/postcss-parse.cjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Marked regions of editor/ui.html. `RAPIER_EDITOR_ONLY` marks the editing controls; `RAPIER_READER_SKIP` marks what a reading
const MARK_LINE = /^[ \t]*<!-- RAPIER_(?:EDITOR_ONLY|READER_SKIP)_(?:BEGIN|END) -->\n/gm;
const MARK_REGION = /^[ \t]*<!-- RAPIER_(EDITOR_ONLY|READER_SKIP)_BEGIN -->\n[\s\S]*?^[ \t]*<!-- RAPIER_\1_END -->\n/gm;
function checkMarks(ui) {
	let open = null;
	for (const [, kind, edge] of ui.matchAll(/<!-- RAPIER_(EDITOR_ONLY|READER_SKIP)_(BEGIN|END) -->/g)) {
		if (edge === 'BEGIN' ? open !== null : open !== kind) throw new Error('editor/ui.html reader markers are unbalanced');
		open = edge === 'BEGIN' ? kind : null;
	}
	if (open !== null) throw new Error('editor/ui.html reader markers are unbalanced');
}
export function editorOnlyMarkup(ui) {
	checkMarks(ui);
	return ui.replace(MARK_LINE, '');
}

const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'use', 'circle', 'path', 'line', 'rect', 'polyline', 'polygon', 'source']);
function scan(markup) {
	const tokens = [], tag = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)/y;
	for (let at = 0; at < markup.length;) {
		const open = markup.indexOf('<', at);
		if (open < 0) break;
		if (markup.startsWith('<!--', open)) { at = markup.indexOf('-->', open) + 3; continue; }
		tag.lastIndex = open;
		const match = tag.exec(markup);
		if (!match) { at = open + 1; continue; }
		let end = open + match[0].length, quote = '';
		for (; end < markup.length; end++) {
			const char = markup[end];
			if (quote) { if (char === quote) quote = ''; }
			else if (char === '"' || char === "'") quote = char;
			else if (char === '>') break;
		}
		const text = markup.slice(open, end + 1), name = match[2].toLowerCase();
		tokens.push({start: open, end: end + 1, name, closing: !!match[1], selfClosing: text.endsWith('/>') || VOID.has(name), text});
		at = end + 1;
		if (!match[1] && name === 'pre' && !text.endsWith('/>')) { const close = markup.indexOf('</pre', at); if (close > 0) at = close; }
	}
	return tokens;
}

function elements(markup) {
	const rows = [], stack = [];
	for (const token of scan(markup)) {
		if (token.closing) {
			let at = stack.length - 1;
			while (at >= 0 && stack[at].name !== token.name) at--;
			if (at < 0) continue;
			const [row] = stack.splice(at, stack.length - at);
			row.end = token.end;
			continue;
		}
		const id = /\sid="([^"]*)"/.exec(token.text)?.[1] ?? null, cls = /\sclass="([^"]*)"/.exec(token.text)?.[1] ?? '';
		const row = {start: token.start, end: token.end, id, cls, name: token.name, depth: stack.length};
		rows.push(row);
		if (!token.selfClosing) stack.push(row);
	}
	return rows;
}

function withoutIds(markup, ids) {
	const rows = elements(markup);
	const cuts = ids.map(id => { const row = rows.find(item => item.id === id); if (!row) throw new Error('editor/ui.html has no #' + id); return row; })
		.sort((a, b) => b.start - a.start);
	for (const row of cuts) {
		let {start, end} = row;
		const lineStart = markup.lastIndexOf('\n', start - 1) + 1, lineEnd = markup.indexOf('\n', end), before = markup.slice(lineStart, start), after = lineEnd < 0 ? '' : markup.slice(end, lineEnd);
		if (!before.trim() && !after.trim() && lineEnd >= 0) { start = lineStart; end = lineEnd + 1; }
		markup = markup.slice(0, start) + markup.slice(end);
	}
	return markup;
}

export function dropElements(markup, test) {
	const rows = elements(markup), cuts = [];
	for (const row of rows) if (!cuts.some(cut => row.start >= cut.start && row.end <= cut.end) && test(row, markup.slice(row.start, row.end))) cuts.push(row);
	for (const row of cuts.sort((a, b) => b.start - a.start)) {
		let {start, end} = row;
		const lineStart = markup.lastIndexOf('\n', start - 1) + 1, lineEnd = markup.indexOf('\n', end), before = markup.slice(lineStart, start), after = lineEnd < 0 ? '' : markup.slice(end, lineEnd);
		if (!before.trim() && !after.trim() && lineEnd >= 0) { start = lineStart; end = lineEnd + 1; }
		markup = markup.slice(0, start) + markup.slice(end);
	}
	return markup;
}

const BLOCKS = ['sr-live', 'embed-refused', 'top-bar', 'find-bar', 'document-main', 'scroll-fab', 'scroll-fab-label', 'settings-overlay', 'navigator-overlay',
	'math-plugin-overlay', 'mermaid-plugin-overlay', 'ocr-plugin-overlay', 'plugin-delete-overlay', 'copy-overlay', 'share-overlay', 'privacy-overlay', 'licenses-overlay', 'info-overlay', 'toast-root', 'file-input'];
const CUT = [
	'layout-info', 'code-info', 'copy-info', 'scroll-fab-acorn',
	'filename-input', 'filename-dirty', 'filename-ext-wrap',
	'share-image-compat-toggle', 'share-ledger-authors', 'share-send-back',
	'settings-open-chevron', 'recent-drawer', 'view-mode-toggle', 'settings-pro-section', 'about-review-row',
	'agent-access', 'agent-row', 'goto-line-form', 'goto-line-range', 'restore-notice',
	'share-live-document', 'drawing-plugin-row', 'notes-plugin-row',
];

const SHARED_ACTIONS = ['ocr-install', 'ocr-install-now', 'ocr-dismiss'];
const SHARE_VALUES = ['source'];
const WIRED_BY_ID = ['scroll-fab'];
export function readerActionTable() {
	const app = readFileSync(resolve(root, 'reader/app.js'), 'utf8'), start = app.indexOf('const READER_ACTIONS = {');
	if (start < 0) throw new Error('Reader profile: reader/app.js has no READER_ACTIONS table');
	const body = app.slice(start, app.indexOf('\n};', start));
	return new Set([...body.matchAll(/^\t'([a-z0-9-]+)':/gm)].map(match => match[1]));
}
export function checkReaderActions(markup) {
	const table = readerActionTable(), shared = readFileSync(resolve(root, 'images/ocr.js'), 'utf8'), found = [];
	for (const name of SHARED_ACTIONS) if (!shared.includes("'" + name + "'")) found.push('the shared handler for ' + name + ' is gone');
	for (const tag of markup.match(/<[a-z]+\b[^>]*\bdata-action="[^"]*"[^>]*>/g) || []) {
		const action = /data-action="([^"]*)"/.exec(tag)[1], value = /data-value="([^"]*)"/.exec(tag)?.[1];
		if (!table.has(action) && !SHARED_ACTIONS.includes(action)) found.push('data-action="' + action + '" has no handler in reader/app.js');
		if (action === 'share-choice' && !SHARE_VALUES.includes(value)) found.push('share choice "' + value + '" is not one the reader can make');
	}
	for (const tag of markup.match(/<button\b[^>]*>/g) || []) if (!/data-action=|data-info-close/.test(tag) && !WIRED_BY_ID.some(id => tag.includes('id="' + id + '"'))) found.push('a button with no action: ' + tag.slice(0, 90));
	if (found.length) throw new Error('Reader profile: controls the reader cannot answer: ' + found.join('; '));
}

// `ui` is editor/ui.html as it stands. The licences sheet is not here: it is its own packed part (see `licensesSheet`).
export function readerBlocks(ui) {
	checkMarks(ui);
	ui = ui.replace(MARK_REGION, '').replace(/<!-- RAPIER_NOTES_BEGIN -->[\s\S]*?<!-- RAPIER_NOTES_END -->\n?/g, '').replace(/<!-- RAPIER_COMMERCIAL_BEGIN -->[\s\S]*?<!-- RAPIER_COMMERCIAL_END -->\n?/g, '');
	const rows = elements(ui).filter(row => row.depth === 0);
	const pick = key => {
		const row = rows.find(item => item.id === key || key === 'top-bar' && item.name === 'header' && /\btop-bar\b/.test(item.cls));
		if (!row) throw new Error('editor/ui.html has no block ' + key);
		return ui.slice(row.start, row.end);
	};
	const markup = BLOCKS.filter(key => key !== 'licenses-overlay').map(pick).join('\n') + '\n' + pick('mermaid-plugin-overlay').replaceAll('mermaid-', 'pdf-');
	const present = new Set(elements(markup).map(row => row.id));
	const cut = dropElements(withoutIds(markup, CUT.filter(id => present.has(id))), (row, text) => /\bexport-choice-card\b/.test(row.cls) || /\bexport-choice\b/.test(row.cls) && /data-action="share-choice"[^>]*data-value="(?:editor|web|card|return)"/.test(text.slice(0, text.indexOf('>') + 1)) || /\bsettings-action-row\b/.test(row.cls) && /data-action="document-spacing"/.test(text) || /\bsettings-info-btn\b/.test(row.cls) || /\bexport-choice-toggle\b/.test(row.cls) && /data-(?:action="share-image-compat"|ledger-choice)/.test(text));
	const named = cut.replace(/<button type="button" class="filename-btn" id="filename-btn" data-action="rename"\s+aria-label="rename file">([^<]*)<\/button>/,
		'<span class="filename-btn" id="filename-btn">$1</span>')
		.replace(/<button type="button" class="filename-ext-btn" id="filename-ext-btn" data-action="change-extension"\s+aria-label="change extension">([\s\S]*?<\/span>)<\/button>/,
			'<span class="filename-ext-btn" id="filename-ext-btn">$1</span>');
	if (/data-action="(?:rename|change-extension)"/.test(named)) throw new Error('Reader profile: the file name controls in editor/ui.html changed form');
	checkReaderActions(named);
	return {markup: named, licenses: pick('licenses-overlay'), sprite: spriteOf(ui)};
}

function spriteOf(ui) {
	const sprite = elements(ui).find(row => row.name === 'svg' && row.depth === 0 && /<symbol\b/.test(ui.slice(row.start, row.end)));
	if (!sprite) throw new Error('editor/ui.html has no icon sprite');
	return new Map([...ui.slice(sprite.start, sprite.end).matchAll(/<symbol id="(i-[a-z0-9-]+)"[\s\S]*?<\/symbol>/g)].map(match => [match[1], match[0]]));
}
export function spriteFor(sprite, ...markups) {
	const used = new Set(markups.flatMap(markup => [...markup.matchAll(/href="#(i-[a-z0-9-]+)"/g)].map(match => match[1])));
	const missing = [...used].filter(name => !sprite.has(name));
	if (missing.length) throw new Error('the editor\'s icon sprite lacks ' + missing.join(', '));
	return used.size ? '<svg width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">' + [...used].map(name => sprite.get(name)).join('') + '</svg>' : '';
}

const TOKENS = {
	'--color-bg': '--rapier-bg', '--color-surface': '--rapier-surface', '--color-text': '--rapier-text',
	'--color-text-secondary': '--rapier-muted', '--color-text-muted': '--rapier-muted', '--color-border': '--rapier-border',
	'--color-accent': '--rapier-accent', '--md-measure': '--rapier-measure', '--editor-h-pad': '--rapier-gutter',
};
const TOKEN_SHEETS = ['spec/markdown-style.css', 'editor/styles/rapier-app.css', 'editor/styles/rapier-editor.css'];
export function readerTokenCss() {
	const rules = [], seen = new Set();
	for (const sheet of TOKEN_SHEETS) parseCSS(readFileSync(resolve(root, sheet), 'utf8'), {from: 'rapier-build.css'}).walkRules(rule => {
		const declarations = [];
		for (const decl of rule.nodes.filter(node => node.type === 'decl')) {
			const value = decl.prop === '--color-accent' ? 'var(--rapier-person-accent,' + decl.value + ')' : decl.value;
			if (Object.hasOwn(TOKENS, decl.prop)) { declarations.push(decl.prop + ':var(' + TOKENS[decl.prop] + ',' + value + ')'); seen.add(decl.prop); }
			if (decl.prop === '--md-line' && rule.selector === ':root,.md-render') {
				const multiple = /^calc\(([\d.]+) \* var\(--md-unit\)\)$/.exec(decl.value)?.[1];
				if (!multiple) throw new Error('Reader profile: the house line spacing changed form');
				declarations.push('--md-line:calc(var(--rapier-line-height,' + multiple + ') * var(--md-unit))');
				seen.add(decl.prop);
			}
		}
		if (!declarations.length) return;
		let text = rule.selector + '{' + declarations.join(';') + '}';
		for (let parent = rule.parent; parent.type !== 'root'; parent = parent.parent) {
			if (parent.type !== 'atrule' || parent.name !== 'media') throw new Error('Reader profile: a house token sits outside a media rule');
			text = '@media ' + parent.params + '{' + text + '}';
		}
		rules.push(text);
	});
	const missing = [...Object.keys(TOKENS), '--md-line'].filter(prop => !seen.has(prop));
	if (missing.length) throw new Error('Reader profile: the house sheets no longer declare ' + missing.join(', '));
	return rules.join('\n') + '\n';
}

export function checkReaderPackage({script, markup, css, html}) {
	const found = [];
	const rules = [
		['the editor engine', /\b_rapierUi\b|\brapierFlushDirty\b|\b_rapierCommitSplices\b|\benterBlockEdit\b/],
		['Paint or the Draw editor', /\bRapierDrawPaint|\bRapierDrawBrushes\b|\bRapierDrawWater|\b_rapierDrawFit\b|\brapierOpenDraw\b/],
		['Notes', /\bRapierNotes[A-Z]|\bnotes-open\b/],
		['the JPEG XL encoder', /\brapier-jxl-worker\b|\bjxl-encoder\b/],
		['the agent door', /\bRapierKernel\b|\bRapierAgentCatalog\b|\bdocument\.edit\b/],
		['the comparison worker', /\bRapierDiff\b|\b_rapierCompareWorkerMain\b/],
		['the GPU lexer', /\bgpu-lexer\b|\bRapierGpuLexer\b/],
		['the code-structure reader', /\blib-acorn\b/],
	];
	for (const [part, pattern] of rules) for (const text of [script, markup, html]) { const match = pattern.exec(text); if (match) { found.push(part + ' (' + JSON.stringify(text.slice(Math.max(0, match.index - 30), match.index + 50)) + ')'); break; } }
	if (/@font-face|font\/woff2/.test(css)) found.push('faces');
	if (found.length) throw new Error('Reader profile: the reader must not carry ' + found.join(', '));
}
