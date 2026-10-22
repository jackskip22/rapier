// SPDX-License-Identifier: AGPL-3.0-only
const ORIGIN = 'https://rapier.website';
const PAGE = '/index.html';
export function doorAssetPath(path) {
	return '/door-' + path.slice(1) + '.html';
}
const BEGIN = '<!-- RAPIER_SEO_BEGIN -->';
const END = '<!-- RAPIER_SEO_END -->';
const HEAD_WINDOW = 65536;
const WINDOW = 1024 * 1024;

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
	'/notes': Object.freeze({name: 'Notes', title: 'Private notes app, free and offline | Rapier Notes',
		description: 'Private Markdown notes with colors, pins, checklists, pictures, voice recordings and history. Import from Google Keep and 15+ apps. No account.',
		image: 'og-notes.png', imageSize: [1200, 630], imageAlt: 'Rapier Notes: Markdown notes on your phone',
		h1: 'Private notes app', view: 'notes', related: ['/', '/draw'],
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
		h1: 'Free drawing app online', view: 'draw', related: ['/paint', '/watercolor', '/gallery', '/mermaid-editor'],
		lead: 'Rapier Draw opens a canvas in your browser. Draw with your finger on a phone, or with a mouse or a pressure-sensitive pen. Brush follows your pressure and speed. Select a shape to move, resize, label or restyle it, or attach an arrow that moves with it. Drawings are SVG: sharp at any size and editable later.',
		faq: Object.freeze([
			Object.freeze(['Can I draw on my phone?', 'Yes. Rapier is made for phones first: draw with your finger, and pinch to zoom.']),
			Object.freeze(['Do I need to download anything?', 'No. Draw runs in your browser. There is also an Android app on Google Play.']),
			Object.freeze(['Where does my drawing go?', 'Press Done and it goes into your document as an editable SVG. Save the document as one Markdown file, pictures inside.']),
			Object.freeze(['Is it free?', free]),
		])}),
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
		h1: 'Free painting app online', view: 'paint', related: ['/watercolor', '/draw', '/jxl', '/notes'],
		lead: 'This page opens a canvas with real brushes: oil, bristle, scumble, pencil and pen from MyPaint, and watercolor that flows. Paint with your finger, then smudge, erase and undo. Nothing to download or sign up for.',
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Do I need to download an app?', 'No. It runs in your browser. On Android you can also install Rapier from Google Play.']),
			Object.freeze(['Can kids use it?', 'Yes. There are no ads, accounts or tracking.']),
			Object.freeze(['Can I save my painting?', saved + '.']),
		])}),
	'/jxl': Object.freeze({name: 'JPEG XL converter', title: 'Free JPEG XL converter: JPG, PNG, GIF and video to JXL | Rapier',
		description: 'Convert JPG, PNG, GIF and video to JPEG XL (JXL) in your browser, free. A JPEG restores exactly; videos and GIFs become animated JXL. Offline, nothing uploaded.',
		image: 'og-jxl.png', imageSize: [1200, 630], imageAlt: 'Rapier: convert pictures and videos to JPEG XL on your device',
		h1: 'Free JPEG XL converter', view: 'jxl', encoder: Object.freeze({name: 'rapier-jxl', repository: 'https://github.com/jackskip22/rapier-jxl', package: 'https://www.npmjs.com/package/rapier-jxl'}), related: ['/paint', '/draw', '/notes'],
		lead: 'Convert JPG and PNG pictures, GIFs and videos to JPEG XL (JXL) online, free, as many as you like. Rapier makes the files on your device with the encoder inside it, so it works offline and nothing is uploaded. A JPEG converts losslessly and restores the exact original; a video or animation becomes an animated JPEG XL.',
		faq: Object.freeze([
			Object.freeze(['How do I convert JPG to JXL?', 'Choose or drop your JPEGs, then download each file or all of them as one zip. A JPEG converts losslessly: the original comes back byte for byte.']),
			Object.freeze(['How do I convert PNG to JXL?', 'The same way. A PNG converts losslessly by default, transparency included. For photos you can choose High quality for a smaller file.']),
			Object.freeze(['How do I convert a video to JPEG XL?', 'Choose or drop an MP4, WebM or MOV your browser plays. It becomes an animated JPEG XL at up to 30 frames a second, without sound. A long or large video is made smaller or cut to fit your device, and the row says so.']),
			Object.freeze(['How do I convert a GIF to JPEG XL?', 'The same way. An animated GIF, APNG or animated WebP becomes an animated JPEG XL with every frame and its timing. Lossless keeps every pixel of every frame.']),
			Object.freeze(['Does it work offline?', 'Yes. The JPEG XL encoder is inside Rapier. Keep Rapier as one HTML file and convert pictures with no connection. Videos and animations need JPEG XL complete, a small download asked for once; after that they convert offline too.']),
			Object.freeze(['How many pictures can I convert?', 'As many as you like. Rapier works through them a few at a time, and you can cancel. Download each file or all of them as zip files. If a device runs out of memory, the finished files are kept.']),
			Object.freeze(['Is my picture uploaded?', 'No. Pictures and videos are converted on your device and never leave it.']),
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Which browsers open JPEG XL?', 'Chrome 155, Firefox 158 and Safari 17 and later open JPEG XL. Any browser can make the files here.']),
		]),
		sections: Object.freeze([
			Object.freeze(['How it works', 'The JPEG XL encoder is part of Rapier, which is one offline HTML file. Your browser reads each picture, or plays each video frame by frame, and the encoder writes the JPEG XL file on your device. Nothing is uploaded. A JPEG is carried into JPEG XL without decoding it, then restored and checked against the original before you download.']),
			Object.freeze(['Why JPEG XL', 'A JPEG converts to a smaller file and restores the exact original. Other pictures come out smaller at the same quality. JPEG XL also holds transparency, high dynamic range and animation.']),
			Object.freeze(['Use rapier-jxl in your site or app', 'rapier-jxl is the JPEG XL encoder inside Rapier: pure JavaScript with optional WebAssembly, MIT licensed, no dependencies. It encodes lossless and lossy pictures and animations, carries a JPEG exactly, and keeps alpha and HDR. The still encoder is about 86 KB gzipped; the complete one, with animation and the rest of the format, about 153 KB. Run npm install rapier-jxl, then import {toJXL} from rapier-jxl/image: toJXL(file, {worker}) returns a JPEG XL Blob.', Object.freeze([Object.freeze(['rapier-jxl on GitHub', 'https://github.com/jackskip22/rapier-jxl']), Object.freeze(['rapier-jxl on npm', 'https://www.npmjs.com/package/rapier-jxl'])])]),
		])}),
	'/markdown-to-pdf': Object.freeze({name: 'Markdown to PDF', title: 'Markdown to PDF: free online converter | Rapier',
		description: 'Write or open Markdown and save it as a PDF with searchable text: tables, code, math and pictures. Free, in your browser, nothing uploaded.',
		image: 'og-markdown-to-pdf.png', imageSize: [1200, 630], imageAlt: 'Rapier: Markdown to PDF',
		h1: 'Markdown to PDF', view: 'editor', related: ['/markdown-to-word', '/'],
		lead: 'Paste or open your Markdown, then tap ••• at the top right and .pdf under export. Rapier writes the PDF in your browser: nothing is uploaded. The text stays searchable, and the Markdown travels inside the PDF, so Rapier can open it again as the same Markdown.',
		howTo: Object.freeze(['How to convert Markdown to PDF', Object.freeze(['Paste your Markdown over the starter text, or tap ••• at the top right, then open, and pick a .md file.', 'Tap ••• at the top right, then .pdf under export.', 'Save the PDF. It is written on your device, with searchable text and the Markdown inside it.'])]),
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
		howTo: Object.freeze(['How to convert Markdown to Word', Object.freeze(['Paste your Markdown over the starter text, or tap ••• at the top right, then open, and pick a .md file.', 'Tap ••• at the top right, then .docx under export.', 'Save the .docx. It opens as an editable document, with headings, lists, tables, code and pictures.'])]),
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Is my file uploaded?', local]),
			Object.freeze(['Can I go back from Word to Markdown?', 'Yes. Open a .docx in Rapier and it becomes an editable Markdown page.']),
		])}),
	'/word-to-markdown': Object.freeze({name: 'Word to Markdown', title: 'Word to Markdown: convert .docx to .md online | Rapier',
		description: 'Open a Word document and get clean, editable Markdown, pictures included. Save it as a .md file. Free, in your browser, nothing uploaded.',
		image: 'og-word-to-markdown.png', imageSize: [1200, 630], imageAlt: 'Rapier: Word to Markdown',
		h1: 'Word to Markdown', view: 'editor', related: ['/markdown-to-word', '/'],
		lead: 'Tap ••• at the top right, then open, and pick a .docx file. Rapier turns it into an editable Markdown page: headings, lists, tables, links and pictures. Save, or Share then Markdown, gives you the .md file, with the pictures inside it.',
		howTo: Object.freeze(['How to convert Word to Markdown', Object.freeze(['Tap ••• at the top right, then open, and pick a .docx file.', 'It opens as an editable Markdown page: headings, lists, tables, links and pictures.', 'Tap Save, or Share then Markdown, for the .md file, with the pictures inside it.'])]),
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Is my document uploaded?', local]),
			Object.freeze(['Can I also open a PDF?', 'Yes. A PDF comes in as text where it can. PDF import is a free plug-in.']),
		])}),
	'/mermaid-editor': Object.freeze({name: 'Mermaid editor', title: 'Mermaid diagram editor online, free | Rapier',
		description: 'Write Mermaid flowcharts and other diagrams in Markdown and see them drawn on the page, or draw diagrams you can move by hand. Free, works offline.',
		image: 'og-mermaid-editor.png', imageSize: [1200, 630], imageAlt: 'Rapier: Mermaid diagram editor',
		h1: 'Mermaid diagram editor', view: 'editor', related: ['/draw', '/'],
		lead: 'Write a mermaid code block and Rapier draws it on the page. Flowcharts draw at once; other Mermaid diagrams, such as sequence diagrams and Gantt charts, use the free diagram plug-in, which downloads once and then works offline. Prefer to move boxes by hand? Draw makes diagrams with arrows that stay attached, saved as editable SVG.',
		howTo: Object.freeze(['How to make a Mermaid diagram', Object.freeze(['Start a code block with ```mermaid, or change the starter\'s flowchart.', 'Change the words in the block and the diagram follows on the page.', 'Export the document as PDF, Word or an offline web page, with the diagram drawn.'])]),
		faq: Object.freeze([
			Object.freeze(['Is it free?', free]),
			Object.freeze(['Does it work offline?', offline]),
			Object.freeze(['Can I export the diagram?', 'Yes. Export the document as PDF, Word or an offline web page, with the diagram drawn.']),
		])}),
});

export const GUIDES = Object.freeze({
	'/agents': Object.freeze({name: 'Rapier for agents', file: 'agents.md', title: 'Rapier for AI agents: MCP server, tools and skills',
		description: 'Connect Claude, Cursor, ChatGPT or any MCP client to Rapier with no account. Read and edit one live document with a person, draw, paint and export.',
		image: 'og-agents.png', imageSize: [1200, 630], imageAlt: 'Rapier for agents'}),
});
export const PAGES = Object.freeze({...DOORS, ...GUIDES});
export const STANDALONE = Object.freeze({
	'/gallery': Object.freeze({name: 'Gallery', file: 'gallery.html', title: 'Free vintage ornaments, borders and decorative letters | Rapier Gallery',
		description: 'Thousands of free ornaments, page borders and decorative capital letters, traced from old books. Open any piece in Rapier or download it as SVG.',
		image: 'og-gallery.png', imageSize: [1200, 630], imageAlt: 'Rapier Gallery: ornaments, borders and decorative letters',
		h1: 'Gallery', lead: 'Borders, ornaments and decorative letters, free in Rapier.'}),
});
export const SITE_PAGES = Object.freeze({...PAGES, ...STANDALONE});

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
	if (door.image) {
		out = set(out, /<meta property="og:image" content="[^"]*">/, '<meta property="og:image" content="' + ORIGIN + '/' + door.image + '">');
		out = set(out, /<meta property="og:image:alt" content="[^"]*">/, '<meta property="og:image:alt" content="' + attribute(door.imageAlt) + '">');
		out = set(out, /<meta property="og:image:width" content="[^"]*">/, '<meta property="og:image:width" content="' + door.imageSize[0] + '">');
		out = set(out, /<meta property="og:image:height" content="[^"]*">/, '<meta property="og:image:height" content="' + door.imageSize[1] + '">');
		out = set(out, /<meta name="twitter:image" content="[^"]*">/, '<meta name="twitter:image" content="' + ORIGIN + '/' + door.image + '">');
	}
	out = out.replace(graph[0], () => '<script type="application/ld+json">' + jsonInScript(pageData(path)) + '</script>');
	const home = {title: text(title[1]), description: text(description[1]), canonical: text(canonical[1])};
	return out.slice(0, out.length - END.length) + '<script type="application/json" id="rapier-home-head">' + jsonInScript(home) + '</script>\n' + END;
}

function encoderData(encoder, url) {
	return {'@type': 'SoftwareSourceCode', '@id': url + '#encoder', name: encoder.name, codeRepository: encoder.repository, url: encoder.package,
		programmingLanguage: 'JavaScript', license: 'https://opensource.org/license/mit'};
}
export function pageData(path) {
	const door = SITE_PAGES[path], url = ORIGIN + path;
	return {'@context': 'https://schema.org', '@graph': [
		{'@type': STANDALONE[path] ? 'CollectionPage' : 'WebPage', '@id': url + '#webpage', url, name: door.title, description: door.description, inLanguage: 'en',
			isPartOf: {'@id': ORIGIN + '/#website'}, breadcrumb: {'@id': url + '#breadcrumb'},
			...(door.image ? {primaryImageOfPage: {'@id': url + '#image'}} : {})},
		...(GUIDES[path] ? [{'@type': 'TechArticle', '@id': url + '#article', headline: door.name, url, description: door.description, inLanguage: 'en',
			mainEntityOfPage: {'@id': url + '#webpage'}, publisher: {'@id': ORIGIN + '/#organization'}}] : []),
		{'@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: [
			{'@type': 'ListItem', position: 1, name: 'Rapier', item: ORIGIN + '/'},
			{'@type': 'ListItem', position: 2, name: door.name, item: url}]},
		...(door.image ? [{'@type': 'ImageObject', '@id': url + '#image', url: ORIGIN + '/' + (door.picture || door.image),
			caption: door.imageAlt}] : []),
		...(DOORS[path]?.h1 ? [{'@type': 'WebApplication', '@id': url + '#application', name: door.h1, url, description: door.description,
			applicationCategory: /^\/(?:draw|paint|watercolor)$/.test(path) ? 'DesignApplication' : 'UtilitiesApplication',
			operatingSystem: 'Web', browserRequirements: 'Requires JavaScript', isAccessibleForFree: true,
			offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'}, isPartOf: {'@id': ORIGIN + '/#website'},
			...(door.encoder ? {isBasedOn: {'@id': url + '#encoder'}} : {})}] : []),
		...(door.encoder ? [encoderData(door.encoder, url)] : [])]};
}

function doorGuide(body, path) {
	const name = 'RAPIER_DOOR_' + path.slice(1).toUpperCase();
	const begin = '<!-- ' + name + '_BEGIN -->', end = '<!-- ' + name + '_END -->';
	const start = body.indexOf(begin), close = body.indexOf(end, start + begin.length);
	if (start < 0 || close < 0 || body.indexOf(begin, start + begin.length) >= 0 || body.indexOf(end, close + end.length) >= 0) return null;
	const template = body.slice(start + begin.length, close).trim();
	return /^<template>\s*(<section id="rapier-seo">[\s\S]*<\/section>)\s*<\/template>$/.exec(template)?.[1] ?? null;
}

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
			if (url.pathname !== path) return Response.redirect(url.origin + path + url.search, 308);
			const published = await env.ASSETS.fetch(new Request(new URL(doorAssetPath(path), url), request));
			if (published.status === 304 || published.status === 206 || (published.ok && htmlResponse(published))) return published;
			await release(published);
			const asset = await env.ASSETS.fetch(new Request(new URL(PAGE, url), {method: method === 'HEAD' ? 'HEAD' : 'GET', headers: {accept: 'text/html'}}));
			if (!asset.ok || (method !== 'HEAD' && !asset.body) || contentEncoded(asset) || !htmlResponse(asset)) {
				await release(asset);
				return plain();
			}
			const headers = new Headers(asset.headers);
			headers.delete('content-length'); headers.delete('etag');
			if (method === 'HEAD') {
				await release(asset);
				return new Response(null, {status: 200, headers});
			}
			return new Response(doorStream(asset.body, path), {status: 200, headers});
		} catch (_) { return plain(); }
	},
};
