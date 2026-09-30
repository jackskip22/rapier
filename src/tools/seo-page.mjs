// SPDX-License-Identifier: AGPL-3.0-only
// What a crawler reads in rapier.html without running a byte of it (docs/build.md, "The page's search words"). The page's own words are
// packed: to a reader that does not execute it the body is script text. This writes the one <section> that says what Rapier is, in plain
// HTML, from two sources: the feature summary below (the README's list, one line each) and the welcome document, the text the editor
// opens on, evaluated from editor/engine.js and rendered with the page's own Markdown grammar (agent/markdown-spec.mjs) with its pictures
// left out. The build writes it between the body's RAPIER_SEO markers of the full page and nowhere else. The head's style hides it from the
// first paint and its <noscript> style shows it where scripting is off, so no person who runs the editor ever sees it; it carries no `hidden`
// attribute, because a reader that ignores stylesheets (a crawler, a reader mode) drops what carries one.
import vm from 'node:vm';
import acorn from '../agent/vendor/acorn.mjs';
import markdownit from '../agent/vendor/markdownit.mjs';
import {markdownPlugins} from '../agent/vendor/markdown-plugins.mjs';
import {RAPIER_MARKDOWN_SPEC, applyMarkdownSpec} from '../agent/markdown-spec.mjs';

// The README's "Everything it does", one line each. Plain, and only what the README already says.
const SUMMARY = `Write, draw, paint and keep notes in one offline app. Rapier is a free, open-source (AGPL-3.0-only) Markdown editor. No account, no telemetry.

## Write

A Markdown editor with a rendered view and a source view: tables, callouts, footnotes, checklists, maths, diagrams, syntax-coloured code, find and replace, and undo. Your file stays plain Markdown.

## Pictures

PNG, JPEG, WebP and SVG pictures live inside the Markdown file, and text wraps around their real shape.

## Draw

Editable SVG with a pressure-sensitive brush, shapes, connected arrows and text; one tap turns a freehand stroke into the shape it resembles.

## Paint

MyPaint brushes, oil, bristle, marker, pencil and watercolour that flows and dries, painted into a layer inside the drawing, with undo.

## Notes

Notes are Markdown files with cards, checklists, recordings, attachments, tags and search. Import from Google Keep, Evernote, Notion, Obsidian and 14 more apps; back up as a zip, or sync, encrypted, to storage you own.

## Files in and out

Open Markdown, Word, text, code, TextPack and PDF. Save Markdown, export Word and PDF, or share one offline web page.

## Privacy

No account, no analytics, no advertising. What you write stays on your device until you save, share, back up or sync it yourself.

## Agents

Work on the same page as an AI agent: it reads by structure, you keep or undo its changes, and the Will marks what it may edit. Use it from Claude or ChatGPT over MCP, or through WebMCP in the browser.

## Where it runs

In a browser, installed as an app, or as one HTML file under 2 MB that you keep in a folder. After the first load it works offline.

[Source](https://github.com/jackskip22/rapier) · [Agent guide](https://github.com/jackskip22/rapier/blob/main/docs/agents.md) · [llms.txt](https://rapier.website/llms.txt) · [Privacy and terms](https://rapier.website/privacy)
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
	const text = vm.runInNewContext(engineSource.slice(found[0].start, found[0].end) + '\nrapierWelcomeMarkdown()', Object.create(null), {timeout: 5000});
	if (typeof text !== 'string' || !text.startsWith('# rapier\n')) throw new Error('rapierWelcomeMarkdown no longer opens on its title');
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
		if (letter && line.trim()) { kept.push(letter + line); letter = ''; continue; }
		kept.push(line);
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

export function seoSection(engineSource) {
	const parser = applyMarkdownSpec(markdownit(RAPIER_MARKDOWN_SPEC.options), markdownPlugins);
	const summary = plain(parser.render(SUMMARY, {docId: 'summary'}));
	const guide = demoted(plain(parser.render(withoutPictures(welcomeMarkdown(engineSource)), {docId: 'guide'})));
	const section = '<section id="rapier-seo">\n<h1>Rapier</h1>\n' + summary + '<article>\n' + guide + '</article>\n</section>';
	// Words only: no picture, script, style, form or comment, and no picture's bytes.
	if (/<(?:img|svg|script|style|iframe|form|input|!--)|data:|RAPIER_/i.test(section)) throw new Error('The search words must be plain text and links');
	return section;
}
