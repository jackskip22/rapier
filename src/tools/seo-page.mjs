// SPDX-License-Identifier: AGPL-3.0-only
// What a crawler reads in rapier.html without running a byte of it. The page's own words are packed: to a reader that does not execute it
// the body is script text. The home guide combines the feature summary below and the welcome document, evaluated from editor/engine.js
// and rendered with the page's Markdown grammar (agent/markdown-spec.mjs) with its pictures left out. Each door takes its own welcome
// sections or the interface's policy sheet. The build writes all guides between the body's RAPIER_SEO markers, the door guides in inert
// templates for the Worker to select. The head's style hides the active guide from the first paint and its <noscript> style shows it
// where scripting is off, so no person who runs the editor ever sees it; it carries no `hidden` attribute, because a reader that ignores
// stylesheets (a crawler, a reader mode) drops what carries one.
import {formatColorRun} from '../spec/md-marks.mjs';
import vm from 'node:vm';
import {VERSION} from '../version.mjs';
import acorn from '../agent/vendor/acorn.mjs';
import markdownit from '../agent/vendor/markdownit.mjs';
import {markdownPlugins} from '../agent/vendor/markdown-plugins.mjs';
import {RAPIER_MARKDOWN_SPEC, applyMarkdownSpec} from '../agent/markdown-spec.mjs';
import {installMarkdownLayout} from '../layout/markdown.mjs';
import {imageStyle, linesHeightCss} from '../spec/md-layout.mjs';
import {installMarkdownImages, dataImage} from '../spec/md-assets.mjs';
import {decodeDataImage, imageDimensions} from '../images/assets.mjs';
import {DOORS} from '../door-worker.js';

// The README's "Everything it does", one line each. Plain, and only what the README already says.
const SUMMARY = `The fast, free Markdown editor for your phone. Write, draw, paint and keep notes, offline, with no account; it works on any device. Rapier is open source (AGPL-3.0-only), with no telemetry.

## Write

A Markdown editor with a rendered view and a source view: tables, callouts, footnotes, checklists, maths, diagrams, syntax-coloured code, find and replace, and undo. Your file stays plain Markdown.

## Pictures

PNG, JPEG, WebP and SVG pictures live inside the Markdown file, and text wraps around their real shape. New rasters are JPEG XL.

## Draw

Editable SVG with a pressure-sensitive brush, shapes, connected arrows and text; one tap turns a freehand stroke into the shape it resembles.

## Paint

MyPaint brushes, oil, bristle, scumble, pencil and pen, painted into a layer inside the drawing, with undo. Water lays watercolour whose pigments mix, flow and dry on textured paper, as a transparent layer.

## Notes

Notes are Markdown files with cards, checklists, recordings, attachments, tags and search. Import from Google Keep, Evernote, Notion, Obsidian and 16 more apps; back up as a zip, or sync, encrypted, to storage you own.

## Files in and out

Open Markdown, Word, text, code, TextPack and PDF. Save Markdown, export Word and PDF, or share one offline web page.

## Privacy

No account, no analytics, no advertising. What you write stays on your device until you save, share, back up or sync it yourself.

## Agents

Work on the same page as an AI agent. It reads only the passages it needs, changes exactly what it read, never overwrites what you are typing, and you keep or drop each change where it lands. It draws native SVG diagrams as editable shapes, and separately renders Mermaid flowcharts from fences. The Will marks what it may edit. Connect Claude, ChatGPT or any MCP client to https://mcp.rapier.website/mcp with no account, or use WebMCP in the browser.

## Where it runs

In a browser, installed as an app, or as one HTML file under 2 MB that you keep in a folder. After the first load it works offline.

[Rapier](https://rapier.website/) · [Rapier Notes](https://rapier.website/notes) · [Rapier Draw](https://rapier.website/draw) · [Source](https://github.com/jackskip22/rapier) · [Agent guide](https://github.com/jackskip22/rapier/blob/main/docs/agents.md) · [llms.txt](https://rapier.website/llms.txt) · [Privacy and terms](https://rapier.website/privacy) · [Commercial licence](https://rapier.website/commercial)
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

// The welcome document's text as the engine writes it: the one function evaluated alone in an empty context, never copied.
export function welcomeMarkdown(engineSource) {
	const found = declarations(acorn.parse(engineSource, {ecmaVersion: 'latest'}), 'rapierWelcomeMarkdown');
	if (found.length !== 1) throw new Error('editor/engine.js must declare rapierWelcomeMarkdown exactly once');
	const text = vm.runInNewContext(engineSource.slice(found[0].start, found[0].end) + '\nrapierWelcomeMarkdown()',
		// The welcome spells a coloured heading through the one marker writer, as the editor does.
		// Its heading reads the page's version meta, which the build writes from version.mjs.
		Object.assign(Object.create(null), {_rapierFormatColorRun: formatColorRun,
			document: {querySelector: selector => selector === 'meta[name="rapier-version"]' ? {content: VERSION} : null}}), {timeout: 5000});
	if (typeof text !== 'string') throw new Error('rapierWelcomeMarkdown must return the welcome text');
	return text;
}

// Pictures are left out: their lines and the reference definitions that carry their bytes. A one-letter picture is a drop cap
// (the guide's "W" opens "ith a decorative letter"), so its letter goes back onto the paragraph it opens.
function withoutPictures(markdown) {
	const kept = [];
	let letter = '';
	for (const line of markdown.split('\n')) {
		const picture = /^!\[([^\]]*)\]\[[^\]]+\](?:\s*<!--.*?-->)?\s*$/.exec(line);
		if (picture) { if ([...picture[1]].length === 1) letter = picture[1]; continue; }
		if (/^\[[^\]]+\]:\s*data:/.test(line)) continue;
		// A text block's layout (a first-line indent, an alignment) is presentation; the plain guide carries the words alone.
		const words = line.replace(/\s*<!--\s*md-layout(?=[: \t-])[^>]*-->\s*$/i, '');
		if (letter && words.trim()) { kept.push(letter + words); letter = ''; continue; }
		kept.push(words);
	}
	return kept.join('\n');
}

// The editor's rendering adds chrome a static page has no use for: a callout's icon, a checklist's live boxes.
const plain = html => html
	.replace(/<svg\b[\s\S]*?<\/svg>/g, '')
	.replace(/<span class="callout__label">([^<]*)<\/span>/g, '<strong>$1.</strong> ')
	.replace(/ class="(?:callout callout-[a-z]+|contains-task-list|task-list-item enabled)"/g, '')
	.replace(/<input class="task-list-item-checkbox"( checked="")? type="checkbox">/g, (_, checked) => checked ? '☑' : '☐');
// Under the page's own <h1>: the guide's title is a second-level heading, its sections third.
const demoted = html => html.replace(/<(\/?)h([1-6])>/g, (_, close, level) => '<' + close + 'h' + Math.min(6, Number(level) + 1) + '>');

// The welcome as the first paint draws it (tools/build.mjs, tools/runtime-loader.js): the same blocks
// the editor will lay out, with each picture's box reserved from the picture's own width and height.
// The picture bytes stay out. The editor's own one-pixel stand-in, plus the measured aspect ratio and
// the same width and height attributes the projection writes, holds the box until those bytes arrive.
// A wrap-around picture stays in normal flow here: the projection's first frame does too. The layout
// pass that pulls it out of flow (layout/browser.js) runs on a later frame and is not this paint.
const WELCOME_PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';

function welcomeParser() {
	const parser = applyMarkdownSpec(markdownit(RAPIER_MARKDOWN_SPEC.options), markdownPlugins);
	installMarkdownImages(parser);
	installMarkdownLayout(parser);
	// The editor's soft break is a word joiner. The callout label meets the next word through it;
	// the span's class is what the style sheet turns into a space everywhere else.
	parser.renderer.rules.softbreak = () =>
		'<span class="rapier-source-token rapier-source-token--softbreak">\u2060</span>';
	parser.renderer.rules.image = (tokens, idx) => welcomeImage(parser, tokens[idx]);
	return parser;
}

function pictureSize(src) {
	const info = dataImage(src);
	if (!info) throw new Error('A welcome picture is not a measurable data image');
	const size = imageDimensions(decodeDataImage(src), info.codec);
	if (!(size.width > 0) || !(size.height > 0)) throw new Error('A welcome picture has no measurable width and height');
	return {width: size.width, height: size.height, codec: info.codec, bytes: info.byteLength};
}

function welcomeImage(parser, token) {
	const src = token.attrGet('src') || '';
	const size = pictureSize(src);
	const alt = String(token.content ?? '');
	const title = token.attrGet('title') || '';
	const layoutMeta = token.meta?.mdLayout;
	const layout = layoutMeta?.imageOnly ? layoutMeta.layout : null;
	const escape = value => parser.utils.escapeHtml(String(value));
	const box = layout ? imageStyle(layout) : '';
	const style = 'aspect-ratio:' + size.width + '/' + size.height + ';' + box;
	const sized = layout?.width != null && box
		? ' data-md-image-width="' + layout.width + '" style="' + style + '"'
		: ' style="' + style + '"';
	const attrs = [
		'data-rapier-markdown-image=""',
		// A reserved box, never a document picture: the picture loader reveals `data-rapier-asset`, and before the welcome is the
		// document it would find no such picture and tell a first visitor an image could not be displayed.
		'data-rapier-reserved=""',
		'src="' + WELCOME_PLACEHOLDER + '"',
		'alt="' + escape(alt) + '"',
		'width="' + size.width + '"',
		'height="' + size.height + '"',
	];
	if (title) attrs.push('title="' + escape(title) + '"');
	return '<img ' + attrs.join(' ') + sized + '>';
}

function renderWelcomeBlocks(parser, markdown) {
	const tokens = parser.parse(markdown, {docId: 'welcome'}), blocks = [];
	let depth = 0, start = 0;
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		if (depth === 0 && token.type === 'reference_definition') { start = index + 1; continue; }
		depth += token.nesting;
		if (depth !== 0) continue;
		const slice = tokens.slice(start, index + 1);
		start = index + 1;
		if (!slice.length || slice.some(row => row.type === 'reference_definition')) continue;
		const html = parser.renderer.render(slice, parser.options, {docId: 'welcome'}).trim();
		if (html) blocks.push(html);
	}
	if (depth !== 0 || !blocks.length) throw new Error('The welcome paint did not split into blocks');
	return blocks;
}

function wrapWelcomeBlock(html) {
	const heading = /^<h([1-6])\b/i.exec(html);
	const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
	const image = /<img\b/i.test(html);
	const classes = ['block-wrapper'];
	if (!text) classes.push('block-wrapper--empty');
	if (image) classes.push('block-wrapper--image');
	if (heading) classes.push('block-wrapper--heading');
	// Fold controls are position:absolute (editor/styles/rapier-editor.css), so they do not change
	// a heading's flow height. The frame does not carry a second copy of that control.
	return '<div class="' + classes.join(' ') + '"><div class="block-read md-render">' + html + '</div></div>';
}

// A picture the text wraps around takes no height of its own in the editor: it stands over the top of the next
// paragraph, whose first lines are shortened beside it (layout/line-plan.mjs keeps ten pixels round it). The first
// paint lays the same: the picture's block is zero-high with the picture over it, and the next paragraph's first
// lines give way to a float the picture's size and gap, so the editor taking over moves nothing.
// A picture sized in lines stands on the first line's cap height: half the line down, less the cap, plus Geist's own
// (ascent - descent) / 2 of 0.355em (layout/model.mjs lineMetrics measures it; the welcome is set in Geist).
function wrappedPicture(html) {
	if (!/<img\b/i.test(html) || !/data-md-layout="[^"]*wrap%3Daround/.test(html)) return null;
	const lines = /data-md-layout="[^"]*lines%3D(\d+)/.exec(html), ratio = /aspect-ratio:(\d+)\/(\d+)/.exec(html);
	if (lines && ratio) {
		const x = /x%3D(\d+(?:\.\d+)?)%25/.exec(html), side = x && Number(x[1]) >= 50 ? 'right' : 'left';
		const height = linesHeightCss(Number(lines[1])), aspect = Number(ratio[1]) / Number(ratio[2]);
		return {side, lines: true, height, top: 'calc(var(--md-line) / 2 + 0.355em - 1cap)', width: 'calc((' + height + ') * ' + aspect + ')'};
	}
	const width = /\bwidth:(\d+(?:\.\d+)?)%/.exec(html), left = /margin-left:(\d+(?:\.\d+)?)%/.exec(html);
	if (!width || !left) return null;
	const side = Number(left[1]) + Number(width[1]) / 2 < 50 ? 'left' : 'right';
	return {width: width[1], side, left: left[1]};
}
function placeWrappedPicture(blocks) {
	const out = [];
	let spacer = null;
	for (let html of blocks) {
		const picture = wrappedPicture(html);
		if (picture) {
			spacer = picture;
			out.push(html
				.replace('<div class="block-wrapper block-wrapper--empty block-wrapper--image">', '<div class="block-wrapper block-wrapper--empty block-wrapper--image" style="height:0;min-height:0;margin:0">')
				.replace('<div class="block-read md-render">', '<div class="block-read md-render" style="position:relative;height:0;min-height:0;padding:0;border:0">')
				.replace(/(<p\b[^>]*?)>/, '$1 style="height:0;margin:0">')
				.replace(picture.lines ? /width:auto;max-width:100%;height:[^;"]*/ : /margin-left:\d+(?:\.\d+)?%;margin-right:0/, picture.lines
					? 'position:absolute;margin:0;max-width:none;height:' + picture.height + ';width:' + picture.width + ';top:' + picture.top + ';' + picture.side + ':0'
					: 'position:absolute;top:0;margin:0;left:' + picture.left + '%'));
			continue;
		}
		if (spacer && /^<div class="block-wrapper"><div class="block-read md-render"><p>/.test(html)) {
			html = html.replace('<p>', '<p><span aria-hidden="true" style="float:' + spacer.side + (spacer.lines
				? ';width:calc(' + spacer.width + ' + 10px);height:calc(' + spacer.top + ' + ' + spacer.height + ' + 10px)"></span>'
				: ';width:calc(' + spacer.width + '% + 10px);aspect-ratio:1"></span>'));
			spacer = null;
		}
		out.push(html);
	}
	return out;
}

export function welcomePaintHtml(engineSource) {
	const parser = welcomeParser();
	const blocks = placeWrappedPicture(renderWelcomeBlocks(parser, welcomeMarkdown(engineSource)).map(wrapWelcomeBlock));
	const html = blocks.join('\n');
	if (/<(?:script|style|iframe|form)\b|RAPIER_/i.test(html)) throw new Error('The welcome paint must be the document blocks');
	if (/data:/i.test(html.split(WELCOME_PLACEHOLDER).join(''))) throw new Error('The welcome paint kept a picture payload');
	if (!/<img\b/i.test(html)) throw new Error('The welcome paint reserved no picture box');
	if (!html.includes('class="block-wrapper') || !html.includes('class="block-read md-render"')) throw new Error('The welcome paint is missing the editor block classes');
	return html;
}

export function seoSection(engineSource) {
	const parser = applyMarkdownSpec(markdownit(RAPIER_MARKDOWN_SPEC.options), markdownPlugins);
	const summary = plain(parser.render(SUMMARY, {docId: 'summary'}));
	const guide = demoted(plain(parser.render(withoutPictures(welcomeMarkdown(engineSource)), {docId: 'guide'})));
	const section = '<section id="rapier-seo">\n<h1>Rapier</h1>\n' + summary + '<article>\n' + guide + '</article>\n</section>';
	// Words only: no picture, script, style, form or comment, and no picture's bytes.
	if (/<(?:img|svg|script|style|iframe|form|input|!--)|data:|RAPIER_/i.test(section)) throw new Error('The search words must be plain text and links');
	return section;
}

// Select actual headings, so a heading-like line in a fenced example cannot end a guide.
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
		// A floated specimen and its adjoining description refer to one another. The plain guide keeps
		// standalone instructions; a one-letter picture is a drop cap, restored by withoutPictures.
		const paragraph = tokens[index - 1], next = tokens[index + 2], words = tokens[index + 3];
		if (next?.type !== 'paragraph_open' || next.level !== paragraph.level || words?.type !== 'inline' || words.meta?.mdLayout?.imageOnly) continue;
		for (let line = paragraph.map[0]; line < next.map[1]; line++) omitted.add(line);
	}
	return withoutPictures(lines.slice(from, to).filter((_, index) => !omitted.has(from + index)).join('\n'));
}

// The sheets contain nested link groups. Match their div boundary before dropping the interface's
// wrappers and classes, so a configured agreement or checkout remains the same link the editor shows.
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

// Each address gets the same words as its view in the editor. The connector's published privacy
// document is derived from the same sheet, so its link introduces no second copy of the policy.
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
		'/privacy': sheetGuide(uiMarkup, 'privacy-words') + '\n<p><a href="https://github.com/jackskip22/rapier-plugins/blob/main/PRIVACY.md">Connector privacy and terms</a> use the same policy.</p>\n',
		'/commercial': sheetGuide(uiMarkup, 'commercial-words') + '\n',
	};
	const escape = value => parser.utils.escapeHtml(String(value));
	return Object.fromEntries(Object.entries(DOORS).map(([path, door]) => {
		if (!bodies[path]) throw new Error('The site door has no guide: ' + path);
		const links = [['/', 'Rapier'], ...Object.entries(DOORS).filter(([other]) => other !== path).map(([other, value]) => [other, value.name])]
			.map(([address, label]) => '<a href="https://rapier.website' + address + '">' + escape(label) + '</a>').join(' · ');
		const section = '<section id="rapier-seo">\n<h1>' + escape(door.name) + '</h1>\n' + bodies[path] + '<nav><p>' + links + '</p></nav>\n</section>';
		if (/<(?:img|svg|script|style|iframe|form|input|button|!--)|data:|RAPIER_/i.test(section)) throw new Error('The door guide must be plain text and links');
		return [path, section];
	}));
}
