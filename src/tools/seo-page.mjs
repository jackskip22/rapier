// SPDX-License-Identifier: AGPL-3.0-only
// sections (including Watercolor) or the interface's policy sheet. The build writes all guides between the body's RAPIER_SEO markers, the door guides in inert
import {formatColorRun} from '../spec/md-marks.mjs';
import vm from 'node:vm';
import {VERSION} from '../version.mjs';
import acorn from '../agent/vendor/acorn.mjs';
import markdownit from '../agent/vendor/markdownit.mjs';
import {markdownPlugins} from '../agent/vendor/markdown-plugins.mjs';
import {RAPIER_MARKDOWN_SPEC, applyMarkdownSpec} from '../agent/markdown-spec.mjs';
import {installMarkdownLayout} from '../layout/markdown.mjs';
import {installMarkdownImages} from '../spec/md-assets.mjs';
import {DOORS} from '../door-worker.js';
import {APP_DESCRIPTION, PLAY_URL} from './discovery.mjs';

const SUMMARY = `${APP_DESCRIPTION}

Free and open source (AGPL-3.0-only), with no account or telemetry.

## Write

Write on the formatted page, as in a word processor, or switch to the Markdown source. There is no split preview. Tables, callouts, footnotes, checklists, LaTeX equations, Mermaid diagrams, syntax-coloured code, text-to-speech, find and replace, and undo. Your file stays plain Markdown.

## Pictures

PNG, JPEG, WebP and SVG pictures live inside the Markdown file, and text wraps around their real shape. New rasters are JPEG XL.

## Draw

Draw freehand, build diagrams with connected arrows, and create typographic art. SVG drawings stay sharp and editable inside your Markdown file.

## Paint

MyPaint brushes, oil, bristle, scumble, pencil and pen, painted into a layer inside the drawing, with undo. [Watercolor](https://rapier.website/watercolor) mixes flowing pigments and wet washes on textured paper, in a transparent layer.

## Notes

Notes are Markdown files with colors, pins, checklists, voice recordings, attachments, tags, history and search. Import from 15+ note apps, including Google Keep, Evernote, Notion and Obsidian. Back up as a zip, or sync, encrypted, to storage you own. The Android app also has reminders and a home-screen widget.

## Files in and out

Open Markdown, Word (DOCX), text, code, TextPack and PDF. Export Word, PDF, text and a static offline HTML page for free. Share a .rapier.html file with the full editor inside so someone can edit, comment or suggest changes offline and send the file back.

## Privacy

No account, no analytics, no advertising. Local editing and Notes stay on your device. Connecting an online agent workspace or optional sync service sends the work you choose to share; see the privacy and terms page.

## Agents

An AI agent edits notes, text, diagrams and paintings live, beside you or while you are away. See its presence and changes, tap a change to see what was there before, and undo anything. It reads the passages it needs, changes exactly what it read and preserves what you are typing. It can show a diff of any part with \`show {target:"comparison"}\`. Native SVG diagrams stay editable shapes; Mermaid diagrams stay in Markdown fences. Will regions carry your instructions. Connect Claude, ChatGPT, Muse, Cursor or another MCP client to https://mcp.rapier.website/mcp with no account, or use WebMCP in the browser. Live collaboration needs an internet connection.

## Where it runs

On Android ([Google Play](${PLAY_URL})), in a browser, on Windows, or as one HTML file that you keep in a folder. Let the web editor and the optional features you need load before going offline. The Android app has no Internet permission; optional Google Play asset packs download on first use and then work offline.

[Rapier](https://rapier.website/) · [Rapier Notes](https://rapier.website/notes) · [Rapier Draw](https://rapier.website/draw) · [Rapier Watercolor](https://rapier.website/watercolor) · [Google Play](${PLAY_URL}) · [Source](https://github.com/jackskip22/rapier) · [Agent guide](https://github.com/jackskip22/rapier/blob/main/docs/agents.md) · [llms.txt](https://rapier.website/llms.txt) · [Privacy and terms](https://rapier.website/privacy) · [Commercial licence](https://rapier.website/commercial)
`;

function declarations(node, name, found = []) {
	if (!node || typeof node.type !== 'string') return found;
	if (node.type === 'FunctionDeclaration' && node.id?.name === name) found.push(node);
	for (const [key, value] of Object.entries(node)) {
		if (key === 'start' || key === 'end' || key === 'loc') continue;
		if (Array.isArray(value)) value.forEach(child => declarations(child, name, found));
		else if (value && typeof value === 'object') declarations(value, name, found);
	}
	return found;
}

export function welcomeMarkdown(engineSource) {
	const found = declarations(acorn.parse(engineSource, {ecmaVersion: 'latest'}), 'rapierWelcomeMarkdown');
	if (found.length !== 1) throw new Error('editor/engine.js must declare rapierWelcomeMarkdown exactly once');
	const text = vm.runInNewContext(engineSource.slice(found[0].start, found[0].end) + '\nrapierWelcomeMarkdown()',
		Object.assign(Object.create(null), {_rapierFormatColorRun: formatColorRun,
			document: {querySelector: selector => selector === 'meta[name="rapier-version"]' ? {content: VERSION} : null}}), {timeout: 5000});
	if (typeof text !== 'string') throw new Error('rapierWelcomeMarkdown must return the welcome text');
	return text;
}

function withoutPictures(markdown) {
	const kept = [];
	let letter = '';
	for (const line of markdown.split('\n')) {
		const picture = /^!\[([^\]]*)\]\[[^\]]+\](?:\s*<!--.*?-->)?\s*$/.exec(line);
		if (picture) { if ([...picture[1]].length === 1) letter = picture[1]; continue; }
		if (/^\[[^\]]+\]:\s*data:/.test(line)) continue;
		const words = line.replace(/\s*<!--\s*md-layout(?=[: \t-])[^>]*-->\s*$/i, '');
		if (letter && words.trim()) { kept.push(letter + words); letter = ''; continue; }
		kept.push(words);
	}
	return kept.join('\n');
}

const plain = html => html
	.replace(/<svg\b[\s\S]*?<\/svg>/g, '')
	.replace(/<span class="callout__label">([^<]*)<\/span>/g, '<strong>$1.</strong> ')
	.replace(/ class="(?:callout callout-[a-z]+|contains-task-list|task-list-item enabled)"/g, '')
	.replace(/<input class="task-list-item-checkbox"( checked="")? type="checkbox">/g, (_, checked) => checked ? '☑' : '☐');
const shiftHeadings = (html, by) => html.replace(/<(\/?)h([1-6])>/g, (_, close, level) => '<' + close + 'h' + Math.max(1, Math.min(6, Number(level) + by)) + '>');

export function seoSection(engineSource) {
	const parser = applyMarkdownSpec(markdownit(RAPIER_MARKDOWN_SPEC.options), markdownPlugins);
	const summary = plain(parser.render(SUMMARY, {docId: 'summary'}));
	const guide = shiftHeadings(plain(parser.render(withoutPictures(welcomeMarkdown(engineSource)), {docId: 'guide'})), 1);
	const section = '<section id="rapier-seo">\n<h1>Rapier</h1>\n' + summary + '<article>\n' + guide + '</article>\n</section>';
	if (/<(?:img|svg|script|style|iframe|form|input|!--)|data:|RAPIER_/i.test(section)) throw new Error('The search words must be plain text and links');
	return section;
}

function welcomeGuidePart(source, heading, {omitTitle = false, omitSpecimens = false} = {}) {
	const {tokens, lines} = source, found = [];
	for (let index = 0; index < tokens.length; index++) {
		if (tokens[index].type === 'heading_open' && tokens[index].level === 0 && tokens[index + 1]?.content === heading) found.push(index);
	}
	if (found.length !== 1) throw new Error('The welcome must carry one ' + heading + ' section');
	const start = found[0], opening = tokens[start], rank = Number(opening.tag.slice(1));
	let end = start + 3;
	while (end < tokens.length && !(tokens[end].type === 'heading_open' && tokens[end].level === 0 && Number(tokens[end].tag.slice(1)) <= rank)) end++;
	const from = opening.map[omitTitle ? 1 : 0], to = tokens[end]?.map?.[0] ?? lines.length;
	const omitted = new Set();
	if (omitSpecimens) for (let index = start + 3; index < end; index++) {
		const token = tokens[index], layout = token.meta?.mdLayout;
		if (token.type !== 'inline' || !layout?.imageOnly || layout.layout.wrap !== 'around') continue;
		const picture = token.children.find(child => child.type === 'image');
		if (!picture || [...picture.content].length <= 1) continue;
		const paragraph = tokens[index - 1], next = tokens[index + 2], words = tokens[index + 3];
		if (next?.type !== 'paragraph_open' || next.level !== paragraph.level || words?.type !== 'inline' || words.meta?.mdLayout?.imageOnly) continue;
		for (let line = paragraph.map[0]; line < next.map[1]; line++) omitted.add(line);
	}
	return withoutPictures(lines.slice(from, to).filter((_, index) => !omitted.has(from + index)).join('\n'));
}

function sheetGuide(markup, name) {
	const source = markup.replace(/<!--[\s\S]*?-->/g, '');
	const tags = [...source.matchAll(/<\/?div\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)];
	const found = tags.filter(tag => !tag[0].startsWith('</') && /\bclass="([^"]*)"/.exec(tag[0])?.[1].split(/\s+/).includes(name));
	if (found.length !== 1) throw new Error('The interface must carry one ' + name + ' sheet');
	const start = found[0], at = tags.indexOf(start);
	let depth = 1, end = at + 1;
	for (; end < tags.length; end++) {
		depth += tags[end][0].startsWith('</') ? -1 : 1;
		if (depth === 0) break;
	}
	if (depth !== 0) throw new Error('The ' + name + ' sheet has no closing div');
	return source.slice(start.index + start[0].length, tags[end].index)
		.replace(/<\/?div\b[^>]*>/gi, '')
		.replace(/\sclass="[^"]*"/g, '')
		.replace(/<(\/?)h3>/g, '<$1h2>')
		.replace(/[ \t]*\n[ \t]*/g, '\n').trim();
}

export function seoDoorSections(engineSource, uiMarkup) {
	const parser = applyMarkdownSpec(markdownit(RAPIER_MARKDOWN_SPEC.options), markdownPlugins);
	installMarkdownImages(parser);
	installMarkdownLayout(parser);
	const markdown = welcomeMarkdown(engineSource);
	const source = {tokens: parser.parse(markdown, {docId: 'door-source'}), lines: markdown.split('\n')};
	const render = (text, name) => plain(parser.render(text, {docId: 'door-' + name}));
	const bodies = {
		'/notes': render(welcomeGuidePart(source, 'Notes', {omitTitle: true}), 'notes'),
		'/draw': render(welcomeGuidePart(source, 'Drawing', {omitSpecimens: true}) + '\n' + welcomeGuidePart(source, 'Paint'), 'draw'),
		'/watercolor': shiftHeadings(render(welcomeGuidePart(source, 'Watercolor', {omitTitle: true}), 'watercolor'), -2),
		'/privacy': sheetGuide(uiMarkup, 'privacy-words') + '\n<p><a href="https://github.com/jackskip22/rapier-plugins/blob/main/PRIVACY.md">Connector privacy and terms</a> use the same policy.</p>\n',
		'/commercial': sheetGuide(uiMarkup, 'commercial-words') + '\n',
	};
	const escape = value => parser.utils.escapeHtml(String(value));
	return Object.fromEntries(Object.entries(DOORS).map(([path, door]) => {
		if (!bodies[path]) throw new Error('The site door has no guide: ' + path);
		const links = [['/', 'Rapier'], ...Object.entries(DOORS).filter(([other]) => other !== path).map(([other, value]) => [other, value.name])]
			.map(([address, label]) => '<a href="https://rapier.website' + address + '">' + escape(label) + '</a>').join(' · ');
		const picture = door.picture ? '<figure><img src="https://rapier.website/' + escape(door.picture) + '" alt="' + escape(door.imageAlt) +
			'" width="1200" height="630" style="display:block;max-width:100%;height:auto;background:#fff"><figcaption>Overlapping pigment washes painted with Rapier Water.</figcaption></figure>\n' : '';
		const section = '<section id="rapier-seo">\n<h1>' + escape(door.name) + '</h1>\n' + picture + bodies[path] + '<nav aria-label="Rapier pages"><p>' + links + '</p></nav>\n</section>';
		if (/<(?:svg|script|style|iframe|form|input|button|!--)|data:|RAPIER_/i.test(section) ||
			[...section.matchAll(/<img\b[^>]*>/g)].some(image => !picture.includes(image[0]))) throw new Error('The door guide must contain only its authored picture, text and links');
		return [path, section];
	}));
}
