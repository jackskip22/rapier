// SPDX-License-Identifier: MIT
import {encodeCarried, decodeCarried, writeParts, takeParts, readDocument, readBase, writeBase, takeBase} from './ledger/carried.mjs';
import {sha256} from './ledger/hash.mjs';
import {PAGE_SEED, returnAddress, returnExpiresAt} from './return-address.mjs';

const START = '<script type="text/markdown" id="rapier-document"';
const DRAWING_START = '<script type="text/plain" id="rapier-drawing"';
const END = '</script>';
// The page's search words (rapier.html's RAPIER_SEO regions: description, canonical address, previews, structured data and the plain guide
const SEARCH_WORDS = /<!-- RAPIER_SEO_BEGIN -->[\s\S]*?<!-- RAPIER_SEO_END -->\n?/g;
const OFFLINE_POLICY = "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; " +
	"img-src data: blob:; media-src data: blob:; font-src data: blob:; connect-src 'none'; worker-src blob:; manifest-src 'none'; base-uri 'none'; form-action 'none'";

export {encodeCarried, decodeCarried};

const PREVIEW = /<meta (?:name="(?:description|generator)"|property="og:(?:title|description)") content="[^"]*" data-rapier-preview>\n?/g;
const APPEARANCE = /<meta name="rapier-appearance" content="(light|dark)">\n?/g;
const plainWords = text => text.replace(/!\[[^\]]*\]\[[^\]]*\]|!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/g, '$1')
	.replace(/<[^>]*>/g, '').replace(/[*_`~=]+|\[\^[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
export function pagePreview(markdown) {
	const lines = String(markdown).replace(/^\uFEFF/, '').split(/\r?\n/);
	let title = '', paragraph = [], fence = null, at = 0;
	if (/^---\s*$/.test(lines[0] || '')) { at = lines.indexOf('---', 1) + 1 || lines.length; }
	for (; at < lines.length; at++) {
		const line = lines[at], marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
		if (fence) { if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null; continue; }
		if (marker) { fence = marker; if (paragraph.length) break; continue; }
		const heading = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
		if (heading) { if (paragraph.length) break; if (!title) title = plainWords(heading[1]); continue; }
		if (!/\S/.test(line)) { if (paragraph.length) break; continue; }
		if (!paragraph.length && /^\s*(?:[>|<]|[-*+]\s|\d+[.)]\s|\[[^\]]+\]:|!\[|\$\$|[-*_]{3,}\s*$)/.test(line)) continue;
		paragraph.push(line);
		if (title && paragraph.length > 8) break;
	}
	const words = plainWords(paragraph.join(' '));
	const sentence = /^.{20,300}?[.!?](?=\s|$)/.exec(words)?.[0] || (words.length <= 200 ? words : words.slice(0, 200).replace(/\s+\S*$/, '') + '…');
	return {title, description: sentence};
}
function previewHead(markdown, fallbackTitle) {
	const {title, description} = pagePreview(markdown);
	const meta = (key, name, value) => '<meta ' + key + '="' + name + '" content="' + value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '" data-rapier-preview>\n';
	return (description ? meta('name', 'description', description) : '') + meta('property', 'og:title', title || fallbackTitle) +
		(description ? meta('property', 'og:description', description) : '') + meta('name', 'generator', 'Rapier (https://rapier.website)');
}

function safeName(name, fallback) {
	return [...String(name || fallback).replace(/[\\/\0"<>&]/g, '-')].slice(0, 256).join('').replace(/[\uD800-\uDBFF]$/, '') || fallback;
}

export function offlineTemplate(pageHtml, address = null) {
	const end = pageHtml.indexOf('</head>');
	if (end < 0) throw new Error('not a Rapier page: no </head>');
	const attribute = (tag, name) => {
		const match = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag);
		return match ? match[1] ?? match[2] ?? match[3] : '';
	};
	const head = pageHtml.slice(0, end).replace(/<meta\b[^>]*>/gi, tag =>
		attribute(tag, 'http-equiv').toLowerCase() === 'content-security-policy' ? '' : tag).replace(/<link\b[^>]*>/gi, tag =>
		attribute(tag, 'rel').toLowerCase().split(/\s+/).some(rel => ['icon', 'apple-touch-icon', 'manifest', 'preconnect', 'dns-prefetch'].includes(rel)) ? '' : tag);
	const anchor = /<meta charset[^>]*>\n?/i.exec(head) || /<head[^>]*>\n?/.exec(head);
	if (!anchor) throw new Error('not a Rapier page: no <head>');
	const at = anchor.index + anchor[0].length;
	const policy = address == null ? OFFLINE_POLICY : OFFLINE_POLICY.replace("connect-src 'none'", 'connect-src ' + new URL(returnAddress(address)).origin);
	return head.slice(0, at) + '<meta http-equiv="Content-Security-Policy" content="' + policy + '">\n' +
		head.slice(at) + pageHtml.slice(end);
}

export const CHOICES = Object.freeze(['drawing', 'layout', 'math', 'mermaid']);
const INVENTORY = '<script type="application/json" id="rapier-builtin-plugins">';
const element = (html, id) => {
	const start = html.indexOf('<script type="application/rapier-runtime" id="' + id + '">');
	if (start < 0) return null;
	const end = html.indexOf(END, start) + END.length;
	return {start, end: html[end] === '\n' ? end + 1 : end};
};

export function carry(pageHtml, include = []) {
	const kept = new Set(include);
	for (const id of kept) if (!CHOICES.includes(id)) throw new Error('a carried page includes ' + CHOICES.join(', ') + '; not ' + id);
	if (kept.has('drawing')) kept.add('letters');
	let html = pageHtml;
	const cut = id => { const at = element(html, id); if (at) html = html.slice(0, at.start) + html.slice(at.end); };
	const parts = new Set([...(kept.has('drawing') ? ['rapier-part-drawing'] : []), ...(kept.has('layout') ? ['rapier-part-document'] : [])]);
	for (const id of [...new Set([...html.matchAll(/<script type="application\/rapier-runtime" id="(rapier-part-[a-z-]+)">/g)].map(match => match[1]))])
		if (!parts.has(id)) cut(id);
	const start = html.indexOf(INVENTORY);
	if (start < 0) return html;
	const close = html.indexOf(END, start), end = html[close + END.length] === '\n' ? close + END.length + 1 : close + END.length;
	const groups = JSON.parse(html.slice(start + INVENTORY.length, close)), carried = groups.filter(group => kept.has(group.id));
	html = html.slice(0, start) + (carried.length ? INVENTORY + JSON.stringify(carried).replace(/</g, '\\u003c') + END + '\n' : '') + html.slice(end);
	for (const group of groups) if (!kept.has(group.id)) cut(group.element);
	return html;
}

export function portableNeeds(text, {base, flowchart} = {}) {
	const needs = new Set();
	for (const source of [text, base]) {
		if (typeof source !== 'string') continue;
		let prose = '';
		const front = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(source);
		if (front && /^template:[ \t]*page[ \t]*$/m.test(front[0])) needs.add('layout');
		const lines = source.split(/\r\n|\r|\n/);
		for (let at = 0; at < lines.length; at++) {
			const open = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(lines[at]);
			if (!open) { prose += lines[at] + '\n'; continue; }
			const body = [];
			for (at++; at < lines.length && !new RegExp('^ {0,3}' + open[1][0] + '{' + open[1].length + ',}\\s*$').test(lines[at]); at++) body.push(lines[at]);
			if (open[2].toLowerCase() === 'mermaid' && flowchart?.(body.join('\n')) !== true) needs.add('mermaid');
		}
		if (/\$\$[\s\S]+?\$\$|(?:^|[^\\$])\$(?![\s$])[^$\n]*[^\s\\$]\$(?!\d)/.test(prose.split(/\n[ \t]*\n/).map(paragraph => paragraph.replace(/(`+)[\s\S]*?\1/g, '')).join('\n\n'))) needs.add('math');
	}
	return CHOICES.filter(id => needs.has(id));
}

export function wrap(pageHtml, text, name, options) {
	if (typeof pageHtml !== 'string' || !pageHtml.includes('</body>')) throw new Error('not a Rapier page: no </body>');
	if (typeof text !== 'string') throw new Error('the document must be text');
	const saved = readDocument(text);
	text = saved.text;
	const previous = unwrap(pageHtml);
	const opts = {...saved, ...(options || {})};
	const theme = opts.theme ?? previous.theme;
	if (theme != null && !['light', 'dark'].includes(theme)) throw new Error('the theme is light or dark');
	const docName = safeName(name, 'document.md');
	if (opts.kind != null && !['markdown', 'text', 'code'].includes(opts.kind)) throw new Error('invalid document kind');
	if (opts.view != null && !['draw', 'notes'].includes(opts.view)) throw new Error('the view is draw or notes');
	const address = opts.return == null ? null : returnAddress(opts.return);
	const expiry = opts.return_expires_at == null ? null : returnExpiresAt(opts.return_expires_at);
	if (!!address !== !!expiry) throw new Error('a return needs return_url and return_expires_at from show {target:"return"}');
	const block = START + ' data-name="' + docName + '"' + (opts.kind ? ' data-kind="' + opts.kind + '"' : '') + (opts.view ? ' data-view="' + opts.view + '"' : '') +
		(address ? ' data-return="' + address + '" data-return-expires-at="' + expiry + '"' : '') + '>' + encodeCarried(text) + END;
	let carriedBlocks = '\n' + writeParts(text, opts);
	if (opts.drawing != null) {
		if (typeof opts.drawing !== 'string') throw new Error('the drawing must be SVG text');
		const drawingName = safeName(opts.drawingName, 'drawing.svg');
		carriedBlocks += '\n' + DRAWING_START + ' data-name="' + drawingName + '">' + encodeCarried(opts.drawing) + END;
	}
	if ((opts.by != null || opts.at != null) && opts.base == null && previous.base == null) throw new Error('comparison attribution needs its original text');
	let baseline = previous.comparisonBase;
	if (!baseline && opts.base != null) {
		if (typeof opts.base === 'object') baseline = readBase(opts.base);
		else {
			if (typeof opts.base !== 'string') throw new Error('the base must be text');
			const carriedBase = /^\s*<!doctype html/i.test(opts.base) ? takeBase(opts.base).base : null;
			const pageBase = !carriedBase && /^\s*<!doctype html/i.test(opts.base) ? unwrap(opts.base) : null;
			const source = carriedBase ? {text: carriedBase.text} : pageBase?.text != null ? readDocument(pageBase.text) : readDocument(opts.base);
			baseline = carriedBase || pageBase?.comparisonBase || readBase({text: source.text, sha256: sha256(source.text),
				revision: source.ledger?.head.root || pageBase?.ledger?.head.root || sha256(source.text), name: safeName(opts.baseName || pageBase?.name, docName),
				by: opts.by == null ? 'Agent' : String(opts.by).trim(), at: opts.at == null ? new Date().toISOString() : String(opts.at)});
		}
	}
	if (baseline) baseline = readBase({...baseline, ...(opts.by != null ? {by: String(opts.by).trim()} : {}), ...(opts.at != null ? {at: String(opts.at)} : {})});
	carriedBlocks += '\n' + writeBase(text, baseline);
	const unseeded = offlineTemplate(previous.html.replace(SEARCH_WORDS, '').replace(PREVIEW, '').replace(APPEARANCE, '').split(PAGE_SEED + '\n').join(''), address);
	const headTag = /<meta charset[^>]*>\n?/i.exec(unseeded) || /<head[^>]*>\n?/.exec(unseeded);
	if (!headTag) throw new Error('not a Rapier page: no <head>');
	const seededAt = headTag.index + headTag[0].length;
	const stripped = unseeded.slice(0, seededAt) + PAGE_SEED + '\n'
		+ (theme ? '<meta name="rapier-appearance" content="' + theme + '">\n' : '') + unseeded.slice(seededAt);
	const bodyTag = /<body[^>]*>/.exec(stripped);
	if (!bodyTag) throw new Error('not a Rapier page: no <body>');
	const at = bodyTag.index + bodyTag[0].length;
	const titled = stripped.replace(/<title>[^<]*<\/title>\n?/, all => '<title>' + docName.replace(/&/g, '&amp;').replace(/</g, '&lt;') + ' — Rapier</title>' +
		(all.endsWith('\n') ? '\n' : '') + previewHead(text, docName.replace(/\.[^.]*$/, '')));
	const shift = titled.length - stripped.length;
	return titled.slice(0, at + shift) + '\n' + block + carriedBlocks + titled.slice(at + shift);
}
export function unwrap(pageHtml) {
	const theme = Array.from(pageHtml.matchAll(APPEARANCE), match => match[1])[0] || null;
	let html = pageHtml, text = null, name = null, kind = null, view = null, address = null, expiry = null;
	const a = pageHtml.indexOf(START);
	if (a >= 0) {
		const open = pageHtml.indexOf('>', a), b = pageHtml.indexOf(END, open);
		if (open < 0 || b < 0) throw new Error('a carried document without its end');
		name = /data-name="([^"]*)"/.exec(pageHtml.slice(a, open))?.[1] ?? null;
		kind = /data-kind="(markdown|text|code)"/.exec(pageHtml.slice(a, open))?.[1] ?? null;
		view = /data-view="(draw|notes)"/.exec(pageHtml.slice(a, open))?.[1] ?? null;
		const carriedReturn = /data-return="([^"]*)"/.exec(pageHtml.slice(a, open));
		if (carriedReturn) address = returnAddress(carriedReturn[1]);
		const carriedExpiry = /data-return-expires-at="([^"]*)"/.exec(pageHtml.slice(a, open));
		if (carriedExpiry) expiry = returnExpiresAt(carriedExpiry[1]);
		if (!!address !== !!expiry) throw new Error('a carried return needs its URL and return_expires_at');
		text = decodeCarried(pageHtml.slice(open + 1, b));
		html = pageHtml.slice(0, a) + pageHtml.slice(b + END.length);
		if (a > 0 && html[a - 1] === '\n') html = html.slice(0, a - 1) + html.slice(a);
	}
	let drawing = null, drawingName = null;
	const d = html.indexOf(DRAWING_START);
	if (d >= 0) {
		const open = html.indexOf('>', d), b = html.indexOf(END, open);
		if (open < 0 || b < 0) throw new Error('a carried drawing without its end');
		drawingName = /data-name="([^"]*)"/.exec(html.slice(d, open))?.[1] ?? null;
		drawing = decodeCarried(html.slice(open + 1, b));
		html = html.slice(0, d) + html.slice(b + END.length);
		if (d > 0 && html[d - 1] === '\n') html = html.slice(0, d - 1) + html.slice(d);
	}
	const carriedBase = takeBase(html); html = carriedBase.html;
	const comparisonBase = carriedBase.base;
	const parts = takeParts(html, text);
	return {...parts, text, name, kind, view, theme, drawing, drawingName, comparisonBase, base: comparisonBase?.text ?? null, baseName: comparisonBase?.name ?? null, baseSha256: comparisonBase?.sha256 ?? null, baseRevision: comparisonBase?.revision ?? null, by: comparisonBase?.by ?? null, at: comparisonBase?.at ?? null, return: address, return_expires_at: expiry};
}
