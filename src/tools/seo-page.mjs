// SPDX-License-Identifier: AGPL-3.0-only
// The build writes all guides between the body's RAPIER_SEO markers, the door guides in inert
import {formatColorRun} from '../spec/md-marks.mjs';
import vm from 'node:vm';
import {VERSION} from '../version.mjs';
import acorn from '../agent/vendor/acorn.mjs';
import markdownit from '../agent/vendor/markdownit.mjs';
import {markdownPlugins} from '../agent/markdown-plugins.mjs';
import {RAPIER_MARKDOWN_SPEC, applyMarkdownSpec} from '../agent/markdown-spec.mjs';
import {installMarkdownLayout} from '../layout/markdown.mjs';
import {installMarkdownImages} from '../spec/md-assets.mjs';
import {DOORS, GUIDES, SITE_PAGES} from '../door-worker.js';
import {HOME_H1, PLAY_URL, CURRENT_DOOR} from './discovery.mjs';

export const PAGE_IDENTITY = 'rapier-page-id';
export const PAGE_IDENTITY_HEADING = 'rapier-page-title';
const sitePage = path => 'https://rapier.website' + path;
const SUMMARY = `Rapier is a free online Markdown editor. Write on the formatted page or in the Markdown source, on your phone or computer; there is no split preview. The file stays plain Markdown. Open a .md file to read it formatted, or import Word or PDF. Free and open source (AGPL-3.0-only); no account, ads or tracking; works offline.

## Free online Markdown editor

Headings, lists, checklists, tables, footnotes, callouts, syntax-colored code, LaTeX math and Mermaid diagrams, with find and replace, text-to-speech and undo. Paste cells from a spreadsheet and they become a Markdown table. PNG, JPEG, WebP, JPEG XL and SVG pictures live inside the Markdown file, and text wraps around their real shape. Rapier keeps a draft as you work, and Save writes a .md file.

## Free online Markdown viewer

Tap ••• at the top right, then open, and pick a .md file; on Android, open it from your file manager. Headings, tables, checklists, code, math and Mermaid diagrams show formatted. Nothing is uploaded; it works offline. Edit in place, switch to the source, or turn on read only in settings.

## Markdown to PDF

Paste or open your Markdown, tap ••• at the top right, then .pdf under export. The PDF is written on your device, nothing uploaded: searchable text, tables, code, math and pictures as they look on the page. The Markdown travels inside the PDF, so Rapier opens it again as the same file. [Markdown to PDF](${sitePage('/markdown-to-pdf')})

## Markdown to Word

Tap ••• at the top right, then .docx under export, for an editable Word document with headings, lists, tables, code and pictures. [Markdown to Word](${sitePage('/markdown-to-word')})

## Word to Markdown

Tap ••• at the top right, then open, and pick a .docx file. It becomes an editable Markdown page, pictures included, and Save writes the .md file. [Word to Markdown](${sitePage('/word-to-markdown')})

## PDF to Markdown

Tap ••• at the top right, then open, and pick a .pdf file. Choose Editable text and it becomes Markdown you can edit, pictures included. [PDF to Markdown](${sitePage('/pdf-to-markdown')})

## Compare text and documents

Paste two texts, or choose two Markdown, code, Word or PDF files, and see what changed, word by word. A moved paragraph shows as a move, and nothing is uploaded. [Compare documents](${sitePage('/diff')})

## Free diagram maker

Write Mermaid and the diagram is drawn as you type: flowcharts, sequence, class, state and ER diagrams, Gantt charts, mind maps and more. Save it as SVG or PNG, or put it in a document. Flowcharts draw at once; the other kinds use the free diagram plug-in, which downloads once. [Free diagram maker](${sitePage('/diagrams')})

## Other files

Rapier also opens text, code, TextPack and PDF (PDF import is a free plug-in), and exports plain text and a static offline web page. Share a .rapier.html file with the whole editor inside so someone can edit or comment offline and send it back. The [Markdown converter](${sitePage('/convert')}) turns many PDF, Word and HTML files into Markdown at once, or Markdown into Word, PDF or HTML.

## Notes, drawing and painting

[Notes](${sitePage('/notes')}) are Markdown files with colors, pins, checklists, voice recordings, tags, history and search; import from Google Keep, Evernote, Notion, Obsidian and 15+ other apps. [Draw](${sitePage('/draw')}) freehand or build diagrams with connected arrows, kept as editable SVG inside your file. [Paint](${sitePage('/paint')}) with oil, pencil, marker and MyPaint brushes, or [watercolor](${sitePage('/watercolor')}) with flowing pigments on textured paper. The [Gallery](${sitePage('/gallery')}) holds thousands of free ornaments, borders and decorative letters, the [JPEG XL converter](${sitePage('/jxl')}) makes JXL pictures on your device, and the [LaTeX equation editor](${sitePage('/math')}) draws equations for Word, SVG and PNG.

## AI agents

An AI agent can edit with you live, and you see its changes and undo any of them. Connect Claude, ChatGPT, Grok Bot, Cursor or another MCP client to ${CURRENT_DOOR} with no account, or use WebMCP in the browser. See the [agent guide](${sitePage('/agents')}).

## Where it runs

In a browser, on Android ([Google Play](${PLAY_URL})), Windows and Linux, or as one HTML file that you keep in a folder. The Android app has no internet permission.

[Rapier](https://rapier.website/) · [Compare documents](https://rapier.website/diff) · [Source](https://github.com/jackskip22/rapier) · [llms.txt](https://rapier.website/llms.txt) · [Privacy and terms](https://rapier.website/privacy) · [Commercial license](https://rapier.website/commercial)
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

export function seoSection() {
	const parser = applyMarkdownSpec(markdownit(RAPIER_MARKDOWN_SPEC.options), markdownPlugins);
	const summary = plain(parser.render(SUMMARY, {docId: 'summary'}));
	if (!summary.startsWith('<p>')) throw new Error('The home guide must open with its introduction');
	const section = '<section id="rapier-seo" aria-labelledby="' + PAGE_IDENTITY_HEADING + '">\n<h1 id="' + PAGE_IDENTITY_HEADING +
		'" class="' + PAGE_IDENTITY + '">' + parser.utils.escapeHtml(HOME_H1) + '</h1>\n' +
		'<p class="' + PAGE_IDENTITY + '">' + summary.slice('<p>'.length) + '</section>';
	if (/<(?:img|svg|script|style|iframe|form|input|!--)|data:|RAPIER_/i.test(section)) throw new Error('The search words must be plain text and links');
	return section;
}

function welcomeGuidePart(source, heading, {omitTitle = false, omitSpecimens = false, omitLead = false, stopAt = null} = {}) {
	const {tokens, lines} = source, found = [];
	for (let index = 0; index < tokens.length; index++) {
		if (tokens[index].type === 'heading_open' && tokens[index].level === 0 && tokens[index + 1]?.content === heading) found.push(index);
	}
	if (found.length !== 1) throw new Error('The welcome must carry one ' + heading + ' section');
	const start = found[0], opening = tokens[start], rank = Number(opening.tag.slice(1));
	let end = start + 3;
	while (end < tokens.length && !(tokens[end].type === 'heading_open' && tokens[end].level === 0 &&
		(Number(tokens[end].tag.slice(1)) <= rank || stopAt !== null && tokens[end + 1]?.content === stopAt))) end++;
	if (stopAt !== null && tokens[end + 1]?.content !== stopAt) throw new Error('The ' + heading + ' section has no ' + stopAt + ' subsection');
	const from = opening.map[omitTitle ? 1 : 0], to = tokens[end]?.map?.[0] ?? lines.length;
	const omitted = new Set();
	const omit = token => { for (let line = token.map[0]; line < token.map[1]; line++) omitted.add(line); };
	if (omitLead) for (let index = start + 3; index < end; index++) {
		const token = tokens[index];
		if (token.level !== 0 || !token.map || token.type.endsWith('_close')) continue;
		omit(token);
		if (token.type === 'paragraph_open' && !tokens[index + 1]?.meta?.mdLayout?.imageOnly) break;
	}
	if (omitSpecimens) for (let index = start + 3; index < end; index++) {
		const token = tokens[index], layout = token.meta?.mdLayout;
		if (token.type !== 'inline' || !layout?.imageOnly) continue;
		const picture = token.children.find(child => child.type === 'image');
		if (!picture || [...picture.content].length <= 1) continue;
		omit(tokens[index - 1]);
		const subject = new Set(picture.content.toLowerCase().match(/[a-z]{4,}/g) || []);
		for (let other = start + 3; other < end; other++) {
			const named = tokens[other].type === 'inline' && tokens[other].level === 1 && /^(?:This|The) ([a-z]+)\b/i.exec(tokens[other].content)?.[1];
			if (named && subject.has(named.toLowerCase()) && tokens[other - 1].level === 0) omit(tokens[other - 1]);
		}
	}
	const kept = lines.slice(from, to).filter((_, index) => !omitted.has(from + index)).join('\n');
	const cited = new Set([...kept.matchAll(/\[\^([^\]\s]+)\](?!:)/g)].map(match => match[1]));
	const notes = lines.filter(line => cited.has(/^\[\^([^\]\s]+)\]:/.exec(line)?.[1]));
	return withoutPictures(kept + (notes.length ? '\n\n' + notes.join('\n') : ''));
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

export function pageLinks(path, escape) {
	return [['/', 'Rapier'], ...Object.entries(SITE_PAGES).filter(([other]) => other !== path).map(([other, value]) => [other, value.name])]
		.map(([address, label]) => '<a href="https://rapier.website' + address + '">' + escape(label) + '</a>').join(' · ');
}

const PUBLIC = 'https://github.com/jackskip22/rapier/blob/main/';
function guideLink(target) {
	const [file, fragment = ''] = target.split(/(?=#)/);
	const guide = Object.entries(GUIDES).find(([, value]) => value.file === file)?.[0];
	if (guide) return 'https://rapier.website' + guide + fragment;
	if (/^[a-z0-9-]+\.md$/.test(file)) return PUBLIC + 'docs/' + file + fragment;
	const source = /^\.\.\/repo\/(.+)$/.exec(file)?.[1];
	if (source === 'AGENT-TOOLS.json' || source === 'llms.txt') return 'https://rapier.website/' + source + fragment;
	if (source === 'LICENSE') return PUBLIC + 'LICENSE' + fragment;
	if (source) return PUBLIC + 'src/' + source + fragment;
	return target;
}

export function guideSection(markdown, path) {
	const guide = GUIDES[path];
	if (!guide) throw new Error('No site document at ' + path);
	const parser = applyMarkdownSpec(markdownit(RAPIER_MARKDOWN_SPEC.options), markdownPlugins);
	const escape = value => parser.utils.escapeHtml(String(value));
	const body = markdown.replace(/^\uFEFF?# [^\n]*\n/, '').replace(/\]\(([^)\s]+)\)/g, (all, target) => /^[a-z]+:/i.test(target) ? all : '](' + guideLink(target) + ')');
	if (body === markdown) throw new Error('The document must open with its title: ' + guide.file);
	const article = plain(parser.render(body, {docId: 'guide-' + path.slice(1)})).replace(/<(\/?)h1>/g, '<$1h2>');
	const section = '<section id="rapier-seo">\n<h1>' + escape(guide.name) + '</h1>\n<article>\n' + article + '</article>\n<nav aria-label="Rapier pages"><p>' + pageLinks(path, escape) + '</p></nav>\n</section>';
	if (/<(?:img|svg|script|style|iframe|form|input|button)\b|<!--|\b(?:src|href)="(?:data|javascript):/i.test(section)) throw new Error('The ' + guide.file + ' page must be text and links');
	return section;
}

const WATERCOLOR_GUIDE = `Paint watercolor online with Rapier. Blend pigments, lay transparent washes and let wet color spread across textured paper. Use a mouse, a finger or a pen. The editor is free, with no account or installation required.

Watercolor needs WebGPU; without it, Rapier paints with Brushes.

#### Start a watercolor painting

[Rapier Watercolor](https://rapier.website/watercolor) opens Draw with watercolor selected. You can also choose **Watercolor** inside any drawing. Choose a brush and a pigment, set the brush size, and paint on the canvas. Change the water and paint load for a light wash or a stronger mark. Add another color while the first is wet to mix them on the paper.

#### Water, pigment and paper

Water continues moving after a stroke. Wet washes meet and spread; pigment settles into the paper's texture and gathers at drying edges. Control flow, bleed, edge darkening, granulation and drying to shape the result. Paper settings change how the wash behaves, while the canvas background stays separate from the paint.

Use the water tool to wet the paper and the lift tool to take pigment back out. A light wash leaves room for the next color; a drier brush brings out the paper's grain. Undo lets you return to an earlier stroke while you explore a mixture or composition.

#### Keep transparent, movable artwork

The painting is a transparent layer inside an editable drawing. Set the paint, then move or resize it alongside shapes, lettering and other pictures. The paper background is independent, so the painting can sit over a different canvas color or become part of an illustrated document.

Press Done to place the drawing in your document. Text and pictures travel together in one Markdown file, including the image bytes. Save that file, or keep the whole editor and document as an offline HTML page. Your work remains yours to reopen, revise and share.

#### Paint beside your writing

Add a watercolor sketch to a field journal, illustrate a garden plan, paint a study for a letter or make a picture for a note. [Rapier Draw](https://rapier.website/draw) adds editable shapes, connected arrows and text. [Rapier Notes](https://rapier.website/notes) keeps your writing and illustrations together as Markdown notes.

#### Free and offline

Painting runs on your device, with no account or ads. After the editor has loaded, you can keep working offline.
`;

const IMPORT_NAMES = {keep: 'Google Keep', obsidian: 'Obsidian', logseq: 'Logseq', roam: 'Roam Research', bear: 'Bear', textbundle: 'TextBundle',
	joplin: 'Joplin', notion: 'Notion', evernote: 'Evernote', simplenote: 'Simplenote', standardnotes: 'Standard Notes', dayone: 'Day One',
	zoho: 'Zoho Notebook', craft: 'Craft', upnote: 'UpNote', amplenote: 'Amplenote', nextcloud: 'Nextcloud Notes', apple: 'Apple Notes',
	paper: 'Dropbox Paper', onenote: 'OneNote', samsung: 'Samsung Notes'};
const NOT_APPS = new Set(['rapier', 'restore', 'any']);
function notesImportGuide(uiMarkup, escape) {
	const rows = [...uiMarkup.matchAll(/data-action="notes-import-pick" data-value="([a-z]+)"><span class="export-choice__label">[^<]*<\/span><span class="export-choice__description">([^<]*)<\/span>/g)]
		.filter(([, value]) => !NOT_APPS.has(value));
	if (rows.length < 10 || rows.some(([, value]) => !IMPORT_NAMES[value])) throw new Error('Every import sheet row needs its name in tools/seo-page.mjs IMPORT_NAMES');
	const proper = {json: 'JSON', html: 'HTML', csv: 'CSV', markdown: 'Markdown', textbundle: 'TextBundle', word: 'Word', google: 'Google', takeout: 'Takeout', keep: 'Keep'};
	const sentence = text => (text = text.replace(/&amp;/g, '&').replace(/\b[a-z]+\b/g, word => proper[word] || word)).charAt(0).toUpperCase() + text.slice(1) + '.';
	return '<h2>Import notes from other apps</h2>\n<p>In Notes, tap Import and pick the app you are coming from, then the files it exported. Rapier reads them on your device and makes each one a Markdown note. Nothing already in your notes changes.</p>\n' +
		rows.map(([, value, text]) => '<h3>Import from ' + escape(IMPORT_NAMES[value]) + '</h3>\n<p>' + escape(sentence(text)) + '</p>\n').join('');
}

export function seoDoorSections(engineSource, uiMarkup) {
	const parser = applyMarkdownSpec(markdownit(RAPIER_MARKDOWN_SPEC.options), markdownPlugins);
	installMarkdownImages(parser);
	installMarkdownLayout(parser);
	const markdown = welcomeMarkdown(engineSource);
	const source = {tokens: parser.parse(markdown, {docId: 'door-source'}), lines: markdown.split('\n')};
	const render = (text, name) => plain(parser.render(text, {docId: 'door-' + name}));
	const bodies = {
		'/notes': render(welcomeGuidePart(source, 'Notes', {omitTitle: true, omitLead: true}), 'notes'),
		'/draw': render(welcomeGuidePart(source, 'Drawing', {omitSpecimens: true}), 'draw'),
		'/paint': render(welcomeGuidePart(source, 'Paint'), 'paint'),
		'/watercolor': shiftHeadings(render(WATERCOLOR_GUIDE, 'watercolor'), -2),
		'/privacy': sheetGuide(uiMarkup, 'privacy-words') + '\n<p><a href="https://github.com/jackskip22/rapier-plugins/blob/main/PRIVACY.md">Connector privacy and terms</a> use the same policy.</p>\n',
		'/commercial': sheetGuide(uiMarkup, 'commercial-words') + '\n',
	};
	const escape = value => parser.utils.escapeHtml(String(value));
	const searched = door => !door.h1 ? '' : '<p>' + escape(door.lead) + '</p>\n' +
		(door.related?.length ? '<p>Also: ' + door.related.map(other => '<a href="https://rapier.website' + other + '">' + escape(other === '/' ? HOME_H1 : SITE_PAGES[other].h1 || SITE_PAGES[other].name) + '</a>').join(' · ') + '</p>\n' : '') +
		(!door.howTo ? [] : typeof door.howTo[0] === 'string' ? [door.howTo] : door.howTo).map(([heading, steps]) =>
			'<h2>' + escape(heading) + '</h2>\n<ol>\n' + steps.map(step => '<li>' + escape(step) + '</li>\n').join('') + '</ol>\n').join('') +
		'<h2>Questions</h2>\n' + door.faq.map(([question, answer]) => '<h3>' + escape(question) + '</h3>\n<p>' + escape(answer) + '</p>\n').join('') +
		(door.sections || []).map(([heading, text, links]) => '<h2>' + escape(heading) + '</h2>\n<p>' + escape(text) + '</p>\n' +
			(links?.length ? '<p>' + links.map(([label, href]) => '<a href="' + escape(href) + '">' + escape(label) + '</a>').join(' · ') + '</p>\n' : '')).join('');
	bodies['/notes'] += notesImportGuide(uiMarkup, escape);
	return Object.fromEntries(Object.entries(DOORS).map(([path, door]) => {
		if (!bodies[path] && !door.h1) throw new Error('The site door has no guide: ' + path);
		if (door.picture && !door.pictureCaption) throw new Error('A door picture needs its caption: ' + path);
		if (door.h1 && (!door.lead || !door.faq?.length || !door.view || door.related?.some(other => other !== '/' && !SITE_PAGES[other]))) throw new Error('A searched door needs its paragraph, questions, view and known pages: ' + path);
		const links = pageLinks(path, escape);
		const picture = door.picture ? '<figure><img src="https://rapier.website/' + escape(door.picture) + '" alt="' + escape(door.imageAlt) +
			'" width="1200" height="630" style="display:block;max-width:100%;height:auto;background:#fff"><figcaption>' + escape(door.pictureCaption) + '</figcaption></figure>\n' : '';
		const section = '<section id="rapier-seo">\n<h1>' + escape(door.h1 || door.name) + '</h1>\n' + picture + searched(door) + (bodies[path] || '') + '<nav aria-label="Rapier pages"><p>' + links + '</p></nav>\n</section>';
		if (/<(?:svg|script|style|iframe|form|input|button|!--)|data:|RAPIER_/i.test(section) ||
			[...section.matchAll(/<img\b[^>]*>/g)].some(image => !picture.includes(image[0]))) throw new Error('The door guide must contain only its authored picture, text and links');
		return [path, section];
	}));
}
