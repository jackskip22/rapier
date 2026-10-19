// SPDX-License-Identifier: AGPL-3.0-only
// Rapier's dedicated pages, answered with their own head and guide.
//
// One HTML asset carries the application and its search guides. The build keeps the door guides in inert templates
// inside the body's search region. A door replaces the home guide with its own and names its own address in the head.
// The application bytes between and after those regions pass through unchanged; the page opens the view from the address.
//
// The build writes each finished door beside the canonical page (`door-notes.html` and the rest).
// `_redirects` serves that file. The asset layer answers the request, so a normal page does not run this worker.
// If a door request does reach the worker and the file is absent, the canonical page is rewritten in one forward
// pass: each new chunk is searched only with the unmatched marker overlap, then the rest passes through.
//
// Fail open: any doubt (the asset missing, encoded, without its markers or guide) serves the plain page. The worker never
// refuses a person and never stands between `/` and its page.
const ORIGIN = 'https://rapier.website';
const PAGE = '/index.html';
export function doorAssetPath(path) {
	return '/door-' + path.slice(1) + '.html';
}
const BEGIN = '<!-- RAPIER_SEO_BEGIN -->';
const END = '<!-- RAPIER_SEO_END -->';
const HEAD_WINDOW = 65536;
// Bound a malformed asset's buffered prefix; the rest of the application is streamed without decoding.
const WINDOW = 1024 * 1024;

// The words the engine shows while the sheet is open (`_rapierRenderDocumentHead` in editor/engine.js). The row
// runtime-pack-roundtrip reads the served head and the opened sheet's head and refuses a difference.
// A door that is a tool people search for (`h1`) says, in the words a crawler reads without running the page, what
// the searcher came to do: one heading, a short paragraph (`lead`), questions and answers (`faq`)
// and the pages next to it (`related`). It is the free web application at its own address (WebApplication data).
// `view` names what the address opens (the engine's _rapierSearchStarter, draw/door.js, notes/door.js).
const free = 'Yes. Rapier is free and open source, with no account, ads or tracking.';
const offline = 'Yes, once the page has loaded. Add it to your home screen to open it like an app, or keep the whole editor as one HTML file.';
const local = 'No. Rapier works in your browser. Local editing uploads nothing.';
const saved = 'Yes. Press Done to download it as JPEG XL, PNG or layers (OpenRaster), or add it to your document';
export const DOORS = Object.freeze({
	'/privacy': Object.freeze({name: 'Privacy and terms', title: 'Rapier privacy and terms',
		description: 'Rapier privacy and terms: local editing, optional services, data storage and deletion.',
		image: 'og-privacy.png', imageSize: [1200, 630], imageAlt: 'Rapier: privacy and terms'}),
	'/commercial': Object.freeze({name: 'Commercial license', title: 'Rapier commercial license',
		description: 'Commercial licenses for embedding Rapier in proprietary products. The editor is free under AGPL-3.0-only.',
		image: 'og-commercial.png', imageSize: [1200, 630], imageAlt: 'Rapier: commercial license'}),
	// The editor views a search engine may show as sitelinks under the home result: each opens that view
	// (the engine reads the address), and each is a page of its own for a reader that runs nothing.
	// `image` is the card shown when the address is shared: a PNG at the site root, `imageSize` pixels wide and high.
	'/notes': Object.freeze({name: 'Notes', title: 'Private notes app, free and offline | Rapier Notes',
		description: 'Private Markdown notes with colors, pins, checklists, pictures, voice recordings and history. Import from Google Keep and 15+ apps. No account.',
		image: 'og-notes.png', imageSize: [1200, 630], imageAlt: 'Rapier Notes: Markdown notes on your phone',
		h1: 'Private notes app', view: 'notes', related: ['/markdown-editor', '/draw'],
		lead: 'Rapier Notes keeps your notes on your device, as plain Markdown files shown as cards. Pin and color them, add checklists, pictures and voice notes, and go back to any earlier version. Import brings in Google Keep, Apple Notes, Evernote, Notion, Obsidian and more. There is no account. The Android app adds reminders and a home-screen widget.',
		faq: Object.freeze([
			Object.freeze(['Is it a Google Keep alternative?', 'Yes. Import your Google Keep notes from a Google Takeout export: text, checklists, pins and pictures become Markdown notes.']),
			Object.freeze(['Where are my notes kept?', 'On your device, in your browser or the Android app. Nothing is uploaded unless you turn on sync to storage you own.']),
			Object.freeze(['Is there an Android app?', 'Yes, Rapier on Google Play. It has no internet permission.']),
			Object.freeze(['Is it free?', free]),
		])}),
	'/draw': Object.freeze({name: 'Draw', title: 'Free drawing app online: draw on your phone | Rapier Draw',
		description: 'Draw freehand with a finger, mouse or pen, build diagrams with arrows that stay attached, and paint. Free in your browser, no download or account.',
		image: 'og-draw.png', imageSize: [1200, 630], imageAlt: 'Rapier Draw: draw and paint in Markdown',
		h1: 'Free drawing app online', view: 'draw', related: ['/paint', '/watercolor', '/mermaid-editor'],
		lead: 'Rapier Draw opens a canvas in your browser. Draw with your finger on a phone, or with a mouse or a pressure-sensitive pen. Brush follows your pressure and speed. Select a shape to move, resize, label or restyle it, or attach an arrow that moves with it. Drawings are SVG: sharp at any size and editable later.',
		faq: Object.freeze([
			Object.freeze(['Can I draw on my phone?', 'Yes. Rapier is made for phones first: draw with your finger, and pinch to zoom.']),
			Object.freeze(['Do I need to download anything?', 'No. Draw runs in your browser. There is also an Android app on Google Play.']),
			Object.freeze(['Where does my drawing go?', 'Press Done and it goes into your document as an editable SVG. Save the document as one Markdown file, pictures inside.']),
			Object.freeze(['Is it free?', free]),
		])}),
	// The Watercolor card is drawn from `picture` (tools/og-card.mjs). To show a new painting instead, save it as a PNG, change `image` and `imageSize`
	// here and allow the file in .assetsignore; tools/stage-site.mjs reads the image names here. A new file name makes social sites fetch the card again.
	'/watercolor': Object.freeze({name: 'Watercolor', title: 'Free online watercolor painting | Rapier Watercolor',
		description: 'Paint watercolor in your browser with flowing pigments, wet washes and textured paper. Keep transparent paintings in editable drawings. Free, no account.',
		image: 'og-watercolor.png', imageSize: [1200, 630], imageAlt: 'Blue, yellow and rose watercolor washes painted with Rapier Water',
		picture: 'watercolor-painting.png',
		h1: 'Online watercolor painting', view: 'watercolor', related: ['/paint', '/draw'],
		lead: 'This page opens a watercolor canvas. Wet color spreads across textured paper, pigments blend, and washes dry with darker edges. Paint with a finger, a mouse or a pen.',
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Does it work on a phone?', 'Yes. Paint with your finger or a stylus. The flowing Water brush needs a browser with WebGPU; other browsers paint with the watercolor paint brush.']),
			Object.freeze(['Can I save my painting?', saved + ' as an editable drawing.']),
		])}),
	'/paint': Object.freeze({name: 'Paint', title: 'Free painting app online, no download | Rapier Paint',
		description: 'Paint in your browser with oil, bristle, pencil, pen and watercolor brushes. Use a finger, mouse or pen. Free, no download, no account.',
		image: 'og-paint.png', imageSize: [1200, 630], imageAlt: 'Rapier Paint: paint on your phone',
		h1: 'Free painting app online', view: 'paint', related: ['/watercolor', '/draw', '/notes'],
		lead: 'This page opens a canvas with real brushes: oil, bristle, scumble, pencil and pen from MyPaint, and watercolor that flows. Paint with your finger, then smudge, erase and undo. Nothing to download or sign up for.',
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Do I need to download an app?', 'No. It runs in your browser. On Android you can also install Rapier from Google Play.']),
			Object.freeze(['Can kids use it?', 'Yes. There are no ads, accounts or tracking.']),
			Object.freeze(['Can I save my painting?', saved + '.']),
		])}),
	'/markdown-editor': Object.freeze({name: 'Markdown editor', title: 'Free online Markdown editor, no sign-up | Rapier',
		description: 'Write Markdown on the formatted page or in the source: tables, Mermaid, math, pictures. Export PDF and Word. Free, no account, works offline.',
		image: 'og-markdown-editor.png', imageSize: [1200, 630], imageAlt: 'Rapier: free online Markdown editor',
		h1: 'Free online Markdown editor', view: 'editor', related: ['/markdown-to-pdf', '/markdown-to-word', '/markdown-table-editor', '/notes'],
		lead: 'Rapier is a Markdown editor in your browser. Write on the formatted page, as in a word processor, or switch to the Markdown source. Tables, checklists, footnotes, code, LaTeX math and Mermaid diagrams. Your file stays plain Markdown. No sign-up, and it keeps working offline.',
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Do I need to sign up?', 'No. Start typing. Rapier keeps a draft as you work, and Save writes a .md file.']),
			Object.freeze(['Does it work offline?', offline]),
			Object.freeze(['Are my files uploaded?', local]),
			Object.freeze(['Can I export?', 'Yes, for free: PDF, Word (.docx), text and an offline web page.']),
		])}),
	'/markdown-viewer': Object.freeze({name: 'Markdown viewer', title: 'Markdown viewer: open and read .md files online | Rapier',
		description: 'Open a Markdown file and read it formatted: headings, tables, code, math and diagrams. Edit in place or turn on read only. Free, nothing uploaded.',
		image: 'og-markdown-viewer.png', imageSize: [1200, 630], imageAlt: 'Rapier: open and read Markdown files',
		h1: 'Markdown viewer and preview', view: 'editor', related: ['/markdown-editor', '/markdown-to-pdf'],
		lead: 'Open a .md file in Rapier and read it formatted: headings, tables, checklists, code, math and Mermaid diagrams. There is no split preview. The page is the preview, and you can edit it in place. Turn on read only in settings to keep the file as it is.',
		faq: Object.freeze([
			Object.freeze(['How do I open a file?', 'Tap ••• at the top right, then open, and pick a .md file. On Android, open it from your file manager.']),
			Object.freeze(['Is my file uploaded?', local]),
			Object.freeze(['Can I see the Markdown source?', 'Yes. Switch to the source at any time; the file is kept exactly as written.']),
			Object.freeze(['Is it free?', free]),
		])}),
	'/markdown-to-pdf': Object.freeze({name: 'Markdown to PDF', title: 'Markdown to PDF: free online converter | Rapier',
		description: 'Write or open Markdown and save it as a PDF with searchable text: tables, code, math and pictures. Free, in your browser, nothing uploaded.',
		image: 'og-markdown-to-pdf.png', imageSize: [1200, 630], imageAlt: 'Rapier: Markdown to PDF',
		h1: 'Markdown to PDF', view: 'editor', related: ['/markdown-to-word', '/markdown-editor'],
		lead: 'Paste or open your Markdown, then tap ••• at the top right and .pdf under export. Rapier writes the PDF in your browser: nothing is uploaded. The text stays searchable, and the Markdown travels inside the PDF, so Rapier can open it again as the same Markdown.',
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Is my file uploaded?', local]),
			Object.freeze(['Can I add a page break?', 'Yes. Tap + on the bar under the text, then Line.']),
			Object.freeze(['Do tables, code and math come through?', 'Yes, with pictures, drawings and diagrams, as they look on the page.']),
		])}),
	'/markdown-to-word': Object.freeze({name: 'Markdown to Word', title: 'Markdown to Word (.docx): free online converter | Rapier',
		description: 'Turn Markdown into an editable Word document: headings, lists, tables, code and pictures. Free, in your browser, no upload or account.',
		image: 'og-markdown-to-word.png', imageSize: [1200, 630], imageAlt: 'Rapier: Markdown to Word',
		h1: 'Markdown to Word', view: 'editor', related: ['/word-to-markdown', '/markdown-to-pdf'],
		lead: 'Paste or open your Markdown, then tap ••• at the top right and .docx under export. Rapier writes an editable Word document in your browser, with headings, lists, tables, code and pictures. Nothing is uploaded.',
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Is my file uploaded?', local]),
			Object.freeze(['Can I go back from Word to Markdown?', 'Yes. Open a .docx in Rapier and it becomes an editable Markdown page.']),
		])}),
	'/word-to-markdown': Object.freeze({name: 'Word to Markdown', title: 'Word to Markdown: convert .docx to .md online | Rapier',
		description: 'Open a Word document and get clean, editable Markdown, pictures included. Save it as a .md file. Free, in your browser, nothing uploaded.',
		image: 'og-word-to-markdown.png', imageSize: [1200, 630], imageAlt: 'Rapier: Word to Markdown',
		h1: 'Word to Markdown', view: 'editor', related: ['/markdown-to-word', '/markdown-editor'],
		lead: 'Tap ••• at the top right, then open, and pick a .docx file. Rapier turns it into an editable Markdown page: headings, lists, tables, links and pictures. Save, or Share then Markdown, gives you the .md file, with the pictures inside it.',
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Is my document uploaded?', local]),
			Object.freeze(['Can I also open a PDF?', 'Yes. A PDF comes in as text where it can. PDF import is a free plug-in.']),
		])}),
	'/markdown-table-editor': Object.freeze({name: 'Markdown table editor', title: 'Markdown table editor: make tables online, free | Rapier',
		description: 'Edit Markdown tables cell by cell, add rows and columns with + and −, or paste cells from a spreadsheet. The file stays a plain Markdown table.',
		image: 'og-markdown-table-editor.png', imageSize: [1200, 630], imageAlt: 'Rapier: make Markdown tables',
		h1: 'Markdown table editor', view: 'editor', related: ['/markdown-editor', '/markdown-to-pdf'],
		lead: 'Tap a cell to edit it, or drag the handles to move cells. Add cells with the + and − buttons on the bar under the table. Paste cells from a spreadsheet and the table grows to fit. The source stays a plain Markdown table that any app can read.',
		faq: Object.freeze([
			Object.freeze(['How do I make a new table?', 'Tap + on the bar under the text, then the table button.']),
			Object.freeze(['Can I paste from Excel or Google Sheets?', 'Yes. Paste the cells and they become a Markdown table.']),
			Object.freeze(['Is it free?', free]),
		])}),
	'/mermaid-editor': Object.freeze({name: 'Mermaid editor', title: 'Mermaid diagram editor online, free | Rapier',
		description: 'Write Mermaid flowcharts and other diagrams in Markdown and see them drawn on the page, or draw diagrams you can move by hand. Free, works offline.',
		image: 'og-mermaid-editor.png', imageSize: [1200, 630], imageAlt: 'Rapier: Mermaid diagram editor',
		h1: 'Mermaid diagram editor', view: 'editor', related: ['/draw', '/markdown-editor'],
		lead: 'Write a mermaid code block and Rapier draws it on the page. Flowcharts draw at once; other Mermaid diagrams, such as sequence diagrams and Gantt charts, use the free diagram plug-in, which downloads once and then works offline. Prefer to move boxes by hand? Draw makes diagrams with arrows that stay attached, saved as editable SVG.',
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Does it work offline?', offline]),
			Object.freeze(['Can I export the diagram?', 'Yes. Export the document as PDF, Word or an offline web page, with the diagram drawn.']),
		])}),
});

// The site's documents, each a page of its own: the page's guide is the document (tools/seo-page.mjs guideSection), and the
// editor opens the same document from the site's /docs/ (editor/engine.js _rapierGuideStarter). `file` is its name in docs/.
export const GUIDES = Object.freeze({
	'/agents': Object.freeze({name: 'Rapier for agents', file: 'agents.md', title: 'Rapier for AI agents: MCP server, tools and skills',
		description: 'Connect Claude, Cursor, ChatGPT or any MCP client to Rapier with no account. Read and edit one live document with a person, draw, paint and export.',
		image: 'og-agents.png', imageSize: [1200, 630], imageAlt: 'Rapier for agents'}),
	'/gemini': Object.freeze({name: 'Add Rapier to Gemini', file: 'gemini.md', title: 'Add Rapier to Gemini | Rapier',
		description: 'Use Rapier with Gemini through MCP: a shared Markdown editor in your browser, no account. Keep the result as Markdown or an offline HTML file.',
		image: 'og-gemini.png', imageSize: [1200, 630], imageAlt: 'Add Rapier to Gemini'}),
	'/markdown-standard': Object.freeze({name: 'Self-contained Markdown', file: 'markdown-standard.md', title: 'Self-contained Markdown: one .md file with its images | Rapier',
		description: 'An open MIT convention: one UTF-8 Markdown file holds the document and every image, with optional layout, drawings and an HTML reader.',
		image: 'og-markdown-standard.png', imageSize: [1200, 630], imageAlt: 'Rapier: self-contained Markdown'}),
	'/will': Object.freeze({name: 'Will/1', file: 'will.md', title: 'Will/1: a person\'s instructions for a document region | Rapier',
		description: 'Will/1 marks a region of a Markdown, Word or PDF document with a person\'s instruction that agents and editors honor.',
		image: 'og-will.png', imageSize: [1200, 630], imageAlt: 'Rapier: Will/1'}),
});
// Every page the site serves from a door file, with its head.
export const PAGES = Object.freeze({...DOORS, ...GUIDES});

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal: true});
const beginBytes = encoder.encode(BEGIN), endBytes = encoder.encode(END);
const attribute = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const text = value => String(value).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const jsonInScript = value => JSON.stringify(value).replace(/</g, '\\u003c');

function indexOf(bytes, needle, from = 0) {
	const width = needle.length;
	if (width === 0) return from <= bytes.length ? from : -1;
	const last = bytes.length - width;
	if (from > last) return -1;
	const first = needle[0];
	let at = from;
	while (at <= last) {
		const hit = bytes.indexOf(first, at);
		if (hit < 0 || hit > last) return -1;
		let i = 1;
		for (; i < width; i++) if (bytes[hit + i] !== needle[i]) break;
		if (i === width) return hit;
		at = hit + 1;
	}
	return -1;
}

// `fromRel` is the first start that may match, counted from the beginning of `carry` + `chunk`.
function findAcross(carry, chunk, needle, fromRel = 0) {
	const width = needle.length;
	const carryLength = carry.length;
	const total = carryLength + chunk.length;
	if (fromRel < 0) fromRel = 0;
	if (width === 0 || fromRel > total - width) return -1;
	const first = needle[0];
	const boundary = Math.min(carryLength, total - width + 1);
	for (let start = fromRel; start < boundary; start++) {
		let matched = true;
		for (let i = 0; i < width; i++) {
			const pos = start + i;
			const byte = pos < carryLength ? carry[pos] : chunk[pos - carryLength];
			if (byte !== needle[i]) { matched = false; break; }
		}
		if (matched) return start;
	}
	let at = Math.max(0, fromRel - carryLength);
	const last = chunk.length - width;
	while (at <= last) {
		const hit = chunk.indexOf(first, at);
		if (hit < 0 || hit > last) return -1;
		let i = 1;
		for (; i < width; i++) if (chunk[hit + i] !== needle[i]) break;
		if (i === width) return carryLength + hit;
		at = hit + 1;
	}
	return -1;
}

function overlapTail(carry, chunk, width) {
	if (width <= 0) return new Uint8Array(0);
	if (chunk.length >= width) return chunk.subarray(chunk.length - width);
	const length = Math.min(width, carry.length + chunk.length);
	const out = new Uint8Array(length);
	const take = length - chunk.length;
	if (take > 0) out.set(carry.subarray(carry.length - take), 0);
	out.set(chunk, take);
	return out;
}

// `head` is the page's text from its start through the closing marker. Returns it with the door's words, or null
// when the head is not the shape this rewrites (the caller then serves the page as it is).
export function doorHead(head, path) {
	const door = PAGES[path];
	if (!door) return null;
	const title = /<title>([^<]*)<\/title>/.exec(head);
	const description = /<meta name="description" content="([^"]*)">/.exec(head);
	const canonical = /<link rel="canonical" href="([^"]*)">/.exec(head);
	const graph = /<script type="application\/ld\+json">[\s\S]*?<\/script>/.exec(head);
	if (!title || !description || !canonical || !graph || !head.includes(BEGIN) || !head.endsWith(END)) return null;
	const url = ORIGIN + path;
	const set = (text, pattern, replacement) => {
		if (!pattern.test(text)) throw new Error('head tag missing: ' + pattern);
		return text.replace(pattern, () => replacement);
	};
	let out = head;
	out = set(out, /<title>[^<]*<\/title>/, '<title>' + attribute(door.title) + '</title>');
	out = set(out, /<meta name="description" content="[^"]*">/, '<meta name="description" content="' + attribute(door.description) + '">');
	out = set(out, /<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + url + '">');
	out = set(out, /<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="' + attribute(door.title) + '">');
	out = set(out, /<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="' + attribute(door.description) + '">');
	out = set(out, /<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + url + '">');
	out = set(out, /<meta name="twitter:title" content="[^"]*">/, '<meta name="twitter:title" content="' + attribute(door.title) + '">');
	out = set(out, /<meta name="twitter:description" content="[^"]*">/, '<meta name="twitter:description" content="' + attribute(door.description) + '">');
	// A door with a card of its own (tools/og-card.mjs) shows it when its address is shared.
	if (door.image) {
		out = set(out, /<meta property="og:image" content="[^"]*">/, '<meta property="og:image" content="' + ORIGIN + '/' + door.image + '">');
		out = set(out, /<meta property="og:image:alt" content="[^"]*">/, '<meta property="og:image:alt" content="' + attribute(door.imageAlt) + '">');
		out = set(out, /<meta property="og:image:width" content="[^"]*">/, '<meta property="og:image:width" content="' + door.imageSize[0] + '">');
		out = set(out, /<meta property="og:image:height" content="[^"]*">/, '<meta property="og:image:height" content="' + door.imageSize[1] + '">');
		out = set(out, /<meta name="twitter:image" content="[^"]*">/, '<meta name="twitter:image" content="' + ORIGIN + '/' + door.image + '">');
	}
	// The door is a page of the site, under the home page, not a second copy of the application's description.
	const data = {'@context': 'https://schema.org', '@graph': [
		{'@type': 'WebPage', '@id': url + '#webpage', url, name: door.title, description: door.description, inLanguage: 'en',
			isPartOf: {'@id': ORIGIN + '/#website'}, breadcrumb: {'@id': url + '#breadcrumb'},
			...(door.image ? {primaryImageOfPage: {'@id': url + '#image'}} : {})},
		...(GUIDES[path] ? [{'@type': 'TechArticle', '@id': url + '#article', headline: door.name, url, description: door.description, inLanguage: 'en',
			mainEntityOfPage: {'@id': url + '#webpage'}, publisher: {'@id': ORIGIN + '/#organization'}}] : []),
		{'@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: [
			{'@type': 'ListItem', position: 1, name: 'Rapier', item: ORIGIN + '/'},
			{'@type': 'ListItem', position: 2, name: door.name, item: url}]},
		...(door.image ? [{'@type': 'ImageObject', '@id': url + '#image', url: ORIGIN + '/' + (door.picture || door.image),
			caption: door.imageAlt}] : []),
		// A tool people search for is the free web application at this address. Its questions stay in the guide, with no
		// FAQPage data: Google stopped showing FAQ results on 7 May 2026, and the running page does not show the questions.
		...(door.h1 ? [{'@type': 'WebApplication', '@id': url + '#application', name: door.h1, url, description: door.description,
			applicationCategory: /^\/(?:draw|paint|watercolor)$/.test(path) ? 'DesignApplication' : 'UtilitiesApplication',
			operatingSystem: 'Web', browserRequirements: 'Requires JavaScript', isAccessibleForFree: true,
			offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'}, isPartOf: {'@id': ORIGIN + '/#website'}}] : [])]};
	out = out.replace(graph[0], () => '<script type="application/ld+json">' + jsonInScript(data) + '</script>');
	// The page's own head, kept: the sheet's close puts these back (the engine reads this block when it is there).
	const home = {title: text(title[1]), description: text(description[1]), canonical: text(canonical[1])};
	return out.slice(0, out.length - END.length) + '<script type="application/json" id="rapier-home-head">' + jsonInScript(home) + '</script>\n' + END;
}

function doorGuide(body, path) {
	const name = 'RAPIER_DOOR_' + path.slice(1).toUpperCase();
	const begin = '<!-- ' + name + '_BEGIN -->', end = '<!-- ' + name + '_END -->';
	const start = body.indexOf(begin), close = body.indexOf(end, start + begin.length);
	if (start < 0 || close < 0 || body.indexOf(begin, start + begin.length) >= 0 || body.indexOf(end, close + end.length) >= 0) return null;
	const template = body.slice(start + begin.length, close).trim();
	return /^<template>\s*(<section id="rapier-seo">[\s\S]*<\/section>)\s*<\/template>$/.exec(template)?.[1] ?? null;
}

// The whole page as bytes, for a host that has it whole. Decode only the head and search guide; every application byte stays exact.
// A guide page (GUIDES) is given its section; a door takes its section from the page's own template.
export function doorPage(bytes, path, section = null) {
	if (!(section === null ? DOORS[path] : GUIDES[path])) return bytes;
	const end = indexOf(bytes, endBytes), cut = end + endBytes.length;
	if (end < 0 || cut > HEAD_WINDOW) return bytes;
	const bodyAt = indexOf(bytes, beginBytes, cut), bodyEnd = indexOf(bytes, endBytes, bodyAt + beginBytes.length);
	const tailAt = bodyEnd + endBytes.length;
	if (bodyAt < 0 || bodyEnd < 0 || tailAt > WINDOW) return bytes;
	try {
		const head = doorHead(decoder.decode(bytes.subarray(0, cut)), path);
		const guide = section ?? doorGuide(decoder.decode(bytes.subarray(bodyAt + beginBytes.length, bodyEnd)), path);
		if (head === null || guide === null) return bytes;
		const next = encoder.encode(head), body = encoder.encode(BEGIN + '\n' + guide + '\n' + END);
		const middle = bytes.subarray(cut, bodyAt);
		const out = new Uint8Array(next.length + middle.length + body.length + bytes.length - tailAt);
		out.set(next); out.set(middle, next.length); out.set(body, next.length + middle.length);
		out.set(bytes.subarray(tailAt), next.length + middle.length + body.length);
		return out;
	} catch (_) { return bytes; }
}

// Buffer through the body's closing search marker so a missing guide cannot leave a rewritten head over the home body.
// Each chunk is kept once. The marker search covers that chunk and the unmatched overlap only.
// Once both replacements are known, the rest passes through as it arrives.
function doorStream(source, path) {
	const reader = source.getReader(), marker = endBytes, overlap = marker.length - 1;
	const chunks = [];
	let total = 0, carry = new Uint8Array(0), headAt = -1, bodyAt = -1, passing = false;
	const concat = () => {
		const out = new Uint8Array(total);
		let offset = 0;
		for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
		return out;
	};
	return new ReadableStream({
		async pull(controller) {
			try {
				if (passing) {
					const {value, done} = await reader.read();
					if (done) controller.close(); else controller.enqueue(value);
					return;
				}
				for (;;) {
					const read = await reader.read();
					const value = read.value, done = read.done;
					if (value && value.length) {
						const owned = new Uint8Array(value.byteLength);
						owned.set(value);
						const carryAt = total - carry.length;
						if (headAt < 0) {
							const rel = findAcross(carry, owned, marker, 0);
							if (rel >= 0) headAt = carryAt + rel;
						}
						if (headAt >= 0 && bodyAt < 0) {
							const rel = findAcross(carry, owned, marker, headAt + marker.length - carryAt);
							if (rel >= 0) bodyAt = carryAt + rel;
						}
						chunks.push(owned);
						total += owned.length;
						carry = overlapTail(carry, owned, overlap);
					}
					const headCut = headAt < 0 ? -1 : headAt + marker.length;
					const bodyCut = bodyAt < 0 ? -1 : bodyAt + marker.length;
					if (bodyAt >= 0 || done || total > WINDOW || (headAt >= 0 && headCut > HEAD_WINDOW) || (headAt < 0 && total > HEAD_WINDOW)) {
						passing = true;
						const held = total ? concat() : new Uint8Array(0);
						const changed = bodyAt >= 0 && bodyCut <= WINDOW ? doorPage(held, path) : held;
						if (changed.length) controller.enqueue(changed);
						chunks.length = 0;
						total = 0;
						if (done) controller.close();
						return;
					}
				}
			} catch (error) { controller.error(error); }
		},
		cancel(reason) { return reader.cancel(reason); },
	});
}

function contentEncoded(response) {
	const encoding = response.headers.get('content-encoding');
	return !!(encoding && encoding !== 'identity');
}
function htmlResponse(response) {
	return /^text\/html/i.test(response.headers.get('content-type') || '');
}
async function release(response) {
	try { if (response && response.body) await response.body.cancel(); } catch (_) {}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (env && env.DOOR_TRACE) console.log('door-worker ' + url.pathname);
		const plain = () => env.ASSETS.fetch(request);
		try {
			const method = request.method.toUpperCase();
			if (method !== 'GET' && method !== 'HEAD') return plain();
			const path = url.pathname.replace(/\/+$/, '');
			if (!DOORS[path]) return plain();
			// The routes of `_redirects`, kept: a trailing slash goes to the address without it.
			if (url.pathname !== path) return Response.redirect(url.origin + path + url.search, 308);
			const published = await env.ASSETS.fetch(new Request(new URL(doorAssetPath(path), url), request));
			// The door file is served as the asset layer gives it, compressed or not: only the page below is rewritten.
			if (published.status === 304 || published.status === 206 || (published.ok && htmlResponse(published))) return published;
			await release(published);
			const asset = await env.ASSETS.fetch(new Request(new URL(PAGE, url), {method: method === 'HEAD' ? 'HEAD' : 'GET', headers: {accept: 'text/html'}}));
			if (!asset.ok || (method !== 'HEAD' && !asset.body) || contentEncoded(asset) || !htmlResponse(asset)) {
				await release(asset);
				return plain();
			}
			const headers = new Headers(asset.headers);
			// The bytes are not the asset's: its length and validator no longer describe them.
			headers.delete('content-length'); headers.delete('etag');
			if (method === 'HEAD') {
				await release(asset);
				return new Response(null, {status: 200, headers});
			}
			return new Response(doorStream(asset.body, path), {status: 200, headers});
		} catch (_) { return plain(); }
	},
};
