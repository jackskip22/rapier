// notes/import-html.mjs -- three exports that all arrive as HTML or its close relations, one note
// per file: a loose .html/.htm page (any export that says "save as a web page", Zoho Notebook's own
// bulk HTML export among them -- Zoho's own help article, "Export Options in Zoho Notebook",
// names HTML as one of its two whole-account export formats but publishes no schema for it, so it
// is read here as ordinary HTML rather than guessed at further); OneNote's "Single File Web Page"
// (support.microsoft.com "Export notes, pages, or notebooks from OneNote": File > Export > Export
// Current > Single File Web Page (*.mht), a real desktop export distinct from the cloud notebook
// export that carries no readable format), a MIME-multipart container (RFC 2557) with the page as
// one part and its pictures as sibling parts; and Samsung Notes' own "Save as file > Text file"
// (support pages describe the flow; the .txt itself is plain text, no schema to read against), a
// plain-text dump with no markup at all.
//
// Pure: no DOM, no fs, no fetch; shared import grammar and HTML conversion.
import {noteFileName, orderAfter} from './model.mjs';
import {scanLinks} from './links.mjs';
import {addSiblingLinkLine} from './sibling-links.mjs';
import {zipOversizeSkip} from './zip.mjs';
import {htmlToMarkdown} from './html-md.mjs';
import {expandImportZips, literalInline, literalBlock, uniquePictureName, importMetadata} from './import.mjs';
import {readImportText, reportCharacterChange, finishImportCharacters, literalImportSource} from './import-characters.mjs';

// Samsung's plain text and file-name-derived titles use the shared literal import grammar.
const trimHtmlSpace = text => text.replace(/^[ \t\r\n\f]+|[ \t\r\n\f]+$/g, '');

// ---- Names and paths -------------------------------------------------------------------------------
function basenameOf(s) { return String(s || '').split(/[?#]/)[0].split(/[\\/]/).pop() || ''; }
function dirOf(path) { const i = String(path || '').lastIndexOf('/'); return i < 0 ? '' : path.slice(0, i + 1); }
const EXT_MIME = {jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
	bmp: 'image/bmp', svg: 'image/svg+xml', heic: 'image/heic', pdf: 'application/pdf', mp3: 'audio/mpeg', wav: 'audio/wav'};
function mimeFor(name) { return EXT_MIME[basenameOf(name).split('.').pop().toLowerCase()] || 'application/octet-stream'; }

// A note's own <img src> rewritten to the resolved picture's final basename, so html-md.mjs's native
// <img> handling (already escaped and URL-encoded there) needs to know nothing about where a
// picture actually came from -- an MHT part, a zip sibling, or nothing found (left as the source
// wrote it, never silently dropped).
function resolveImages(html, findByRef) {
	return String(html).replace(/(<img\b[^>]*?\bsrc\s*=\s*)("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi, (whole, pre, all, dq, sq, uq) => {
		const raw = (dq ?? sq ?? uq ?? '').replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
			if (e[0] !== '#') return {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"}[e];
			const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
			return Number.isFinite(code) && code >= 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF) ? String.fromCodePoint(code) : m;
		});
		const found = findByRef(raw);
		if (!found) return whole;
		return pre + '"' + found.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"';
	});
}

// A page's head is not its note. Its first <title> became the heading, and a UTF-8 charset (as an
// attribute or inside a Content-Type) is how Rapier read the bytes; neither is kept. Every other
// element -- a stylesheet, a meta detail, a link, a script, a comment -- is kept whole, one value per
// element, so the record keeps once a stylesheet a thousand pages share (import-receipt.mjs), and a
// meta's own name says what it held (author, created). Quotes are honoured, so a '>' inside an
// attribute never ends an element early.
const HEAD_PART = /<!--[\s\S]*?(?:-->|$)|<(style|script|noscript|template|title|xml)\b(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?(?:<\/\1\s*>|$)|<(?:"[^"]*"|'[^']*'|[^'">])*>?|[^<]+/gi;
const headAttr = (tag, name) => new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i').exec(tag)?.slice(1).find(v => v !== undefined);
function headParts(head, warnings) {
	const parts = [], used = new Set();
	let titled = false;
	const add = (key, label, value) => { let name = key, n = 2; while (used.has(name)) name = key + ' ' + n++; used.add(name); parts.push([name, label, value]); };
	for (const [part, element] of String(head).matchAll(HEAD_PART)) {
		if (!part.trim()) continue;
		const tag = (element || /^<\/?([a-z][\w:-]*)/i.exec(part)?.[1] || '').toLowerCase();
		if (part.startsWith('<!--')) add('comment', 'comments', part);
		else if (tag === 'title' && !titled) titled = true;
		else if (element) add(tag, {style: 'styles', script: 'scripts'}[tag] || tag, part);
		else if (tag === 'meta') {
			const charset = headAttr(part, 'charset') ?? /charset\s*=\s*([\w-]+)/i.exec(/^content-type$/i.test(headAttr(part, 'http-equiv') || '') ? headAttr(part, 'content') || '' : '')?.[1];
			const named = headAttr(part, 'name') || headAttr(part, 'property') || headAttr(part, 'http-equiv');
			if (charset !== undefined && /^utf-?8$/i.test(charset)) continue;
			if (named) add('meta ' + named.toLowerCase(), named, part);
			else add(charset !== undefined ? 'meta charset' : 'meta', charset !== undefined ? 'character set' : 'page details', part);
		} else if (tag === 'link') { const rel = headAttr(part, 'rel'); add(rel ? 'link ' + rel.toLowerCase() : 'link', rel ? rel + ' link' : 'links', part); }
		else if (tag === 'base') add('base', 'base address', part);
		else add(tag || 'text', tag || 'text', part);
	}
	importMetadata(Object.fromEntries(parts.map(([key, , value]) => [key, value])), [], warnings, 'Web page parts', {labels: Object.fromEntries(parts.map(([key, label]) => [key, label]))});
}

// Title from <title>, else the first heading (removed from the body so it is not said twice), else
// null (the caller's own file-name fallback). Body is everything inside <body>, or the whole
// document with any <head> cut out when there is no <body> tag (a bare fragment export).
function extractTitleAndBody(html, warnings) {
	const src = String(html);
	const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(src);
	let body = bodyMatch ? bodyMatch[1] : src.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, '');
	headParts(/<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(src)?.[1] || '', warnings);
	const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(src);
	let title = titleMatch ? trimHtmlSpace(htmlToMarkdown(titleMatch[1], {warnings}).replace(/[ \t\r\n\f]+/g, ' ')) : '';
	if (titleMatch) reportCharacterChange(titleMatch[1], title, warnings, 'HTML title');
	if (!title) {
		const h = /<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/i.exec(body);
		if (h) { title = trimHtmlSpace(htmlToMarkdown(h[0], {warnings}).replace(/^#+[ \t]*/, '').replace(/[ \t\r\n\f]+/g, ' ')); body = body.slice(0, h.index) + body.slice(h.index + h[0].length); }
	}
	return {title, body};
}
function noteFromHtml(html, fallbackTitle, findByRef, warnings) {
	const {title, body} = extractTitleAndBody(html, warnings);
	const heading = title || literalInline(fallbackTitle); // HTML-derived titles are already Markdown, not raw text.
	const converted = htmlToMarkdown(resolveImages(body, findByRef), {warnings});
	const blocks = [];
	if (heading) blocks.push('# ' + heading.replace(/(\s+#+)$/, m => m.replace('#', '\\#')));
	if (trimHtmlSpace(converted)) blocks.push(trimHtmlSpace(converted));
	return blocks.join('\n\n').replace(/\r\n?/g, '\n').replace(/[ \t\r\n\f]+$/, '') + '\n';
}

// ---- .mht/.mhtml: a MIME-multipart message (RFC 2557). One boundary, headers per part separated
// from its own body by a blank line, Content-Transfer-Encoding of quoted-printable or base64. -------
function decodeQuotedPrintable(s) {
	const stripped = String(s).replace(/=\r?\n/g, '');
	const bytes = [];
	for (let i = 0; i < stripped.length; i++) {
		const hex = stripped.slice(i + 1, i + 3);
		if (stripped[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) { bytes.push(parseInt(hex, 16)); i += 2; }
		else bytes.push(stripped.charCodeAt(i) & 0xFF);
	}
	return new Uint8Array(bytes);
}
function headerValue(headers, name) {
	const m = new RegExp('^' + name + '\\s*:[ \t]*(.*)$', 'im').exec(String(headers).replace(/\r?\n[ \t]+/g, ' '));
	return m ? m[1].trim() : '';
}
function headerParam(line, name) {
	const m = new RegExp(name + '\\s*=\\s*"([^"]*)"|' + name + '\\s*=\\s*([^\\s;]+)', 'i').exec(line || '');
	return m ? (m[1] ?? m[2]) : '';
}
function parseMht(text, warnings = []) {
	const src = String(text);
	const headEnd = src.search(/\r?\n\r?\n/);
	const head = headEnd < 0 ? src : src.slice(0, headEnd);
	const ctype = headerValue(head, 'Content-Type');
	const boundary = headerParam(ctype, 'boundary');
	if (!boundary) return null;
	const marker = '\n--' + boundary;
	const rest = ('\n' + src.slice(headEnd < 0 ? 0 : headEnd)).replace(/\r\n/g, '\n');
	const chunks = rest.split(marker).slice(1);
	const parts = [];
	for (let chunk of chunks) {
		if (/^(--)?\n?$/.test(chunk) || chunk.startsWith('--')) continue; // the terminating "--boundary--"
		chunk = chunk.replace(/^\n/, '');
		const sep = chunk.search(/\n\n/);
		if (sep < 0) continue;
		const headers = chunk.slice(0, sep), rawBody = chunk.slice(sep + 2);
		const encoding = headerValue(headers, 'Content-Transfer-Encoding').toLowerCase();
		const type = headerValue(headers, 'Content-Type');
		const location = headerValue(headers, 'Content-Location');
		const id = headerValue(headers, 'Content-ID').replace(/^<|>$/g, '');
		// One unreadable part is one unreadable part. `atob` throws on invalid base64, and letting that
		// throw out of the whole parser would stop the container being a MIME container and turn the
		// person's page into a wall of raw headers and quoted-printable in a code fence. So the bad part
		// keeps its own bytes verbatim, says so by name, and the parts beside it are still read (nothing
		// here may be dropped).
		let bytes;
		try {
			bytes = encoding === 'base64' ? Uint8Array.from(atob(rawBody.replace(/\s+/g, '')), c => c.charCodeAt(0))
				: encoding === 'quoted-printable' ? decodeQuotedPrintable(rawBody)
				: new TextEncoder().encode(rawBody);
		} catch (error) {
			bytes = new TextEncoder().encode(rawBody);
			warnings.push({code: 'mime_part_unreadable', name: location || id || type || 'a MIME part',
				message: 'A ' + (encoding || 'plain') + ' MIME part could not be decoded and was kept as it was written; the parts beside it were still read.'});
		}
		parts.push({type: type.split(';')[0].trim().toLowerCase(), charset: headerParam(type, 'charset') || 'utf-8', location, id, bytes});
	}
	parts.start = headerParam(ctype, 'start').replace(/^<|>$/g, '');
	return parts;
}
function textOfPart(part, warnings) {
	return readImportText(part, warnings, 'MIME HTML part', part.charset);
}

// ---- Samsung Notes' Save as file > Text file: the whole file is the note's own words, escaped
// exactly like notes/takeout.mjs's own plain-text rule (support pages: three-dot menu > Save as
// file > Text file, plain text, no formatting kept -- there is nothing else to read against).
function noteFromText(text) {
	return literalBlock(text).replace(/\r\n?/g, '\n').replace(/[ \t\r\n\f]+$/, '') + '\n';
}

function detectKind(name, sniff) {
	if (/\.html?$/i.test(name)) return 'html';
	if (/\.mht(ml)?$/i.test(name)) return 'mht';
	if (/\.txt$/i.test(name)) return 'txt';
	const head = String(sniff || '').slice(0, 512);
	if (/^\s*(<!doctype html|<html\b)/i.test(head)) return 'html';
	if (/^(mime-version|content-type:\s*multipart\/related)/i.test(head.trimStart())) return 'mht';
	return null;
}

export async function importHtml(entries, options) {
	const list = await expandImportZips(Array.isArray(entries) ? entries : []);
	const existing = Array.isArray(options && options.existing) ? options.existing.filter(n => typeof n === 'string') : [];
	const lastOrder = typeof (options && options.lastOrder) === 'string' ? options.lastOrder : '';
	const skipped = [], built = [], pool = existing.slice();
	const sections = []; // no source here carries a category concept; kept for shape parity with the other importers
	const attachments = [], pictures = [], usedPictureNames = new Set();

	// Preserve source paths; the shared picture resolver decides exact matches and ambiguity.
	for (const f of list) {
		if (!f || f.oversize || f.unreadable || typeof f.name !== 'string' || !f.bytes || detectKind(f.name)) continue;
		pictures.push({name: f.name, sourceName: f.name, rootId: f.rootId ?? '', bytes: f.bytes, mime: mimeFor(f.name)});
	}

	for (const f of list) {
		if (!f || typeof f.name !== 'string') continue;
		if (f.oversize) { skipped.push(zipOversizeSkip(f)); continue; }
		if (f.unreadable) { skipped.push({name: f.name, why: f.unreadable}); continue; }
		const warnings = [];
		let text;
		try { text = readImportText(f, warnings); } catch (_) { if (detectKind(f.name)) skipped.push({name: f.name, why: 'no readable text or bytes'}); continue; }
		const kind = detectKind(f.name, text);
		if (!kind) continue; // a sibling attachment, or something outside this importer's family: not an error

		try {
			if (kind === 'txt') {
				if (!text.trim()) { skipped.push({name: f.name, why: 'empty file'}); continue; }
				const noteText = noteFromText(text);
				reportCharacterChange(text, noteText, warnings, 'plain-text body');
				const file = noteFileName(noteText, pool); pool.push(file);
				built.push({file, text: noteText, sourceName: f.name, rootId: f.rootId ?? '', warnings, entry: {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: ''}, created: -Infinity});
				continue;
			}
			if (kind === 'html') {
				if (!text.trim()) { skipped.push({name: f.name, why: 'empty file'}); continue; }
				const fallback = basenameOf(f.name).replace(/\.html?$/i, '');
				const noteText = noteFromHtml(text, fallback, () => null, warnings);
				const file = noteFileName(noteText, pool); pool.push(file);
				built.push({file, text: noteText, sourceName: f.name, rootId: f.rootId ?? '', warnings, entry: {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: ''}, created: -Infinity});
				continue;
			}
			// kind === 'mht': the container's own HTML part is the note; its own sibling parts (matched
			// by Content-Location/Content-ID) take priority over the batch's loose siblings. Its top-level
			// Date header, when present, is a real timestamp -- the one case here that earns one.
			const parts = parseMht(text, warnings);
			if (!parts || !parts.length) { skipped.push({name: f.name, why: 'not a readable MIME container'}); continue; }
			const htmlPart = (parts.start ? parts.find(p => p.id === parts.start && p.type === 'text/html') : parts.find(p => p.type === 'text/html')) || (!parts.start && parts.length === 1 ? parts[0] : null);
			if (!htmlPart) { skipped.push({name: f.name, why: 'no HTML part found'}); continue; }
			const partsUsed = new Set();
			const findPartByRef = ref => {
				let candidates;
				if (/^cid:/i.test(ref)) candidates = parts.filter(p => p.id === ref.slice(4));
				else {
					let absolute = ref; try { absolute = new URL(ref, htmlPart.location).href; } catch (_) { /* no absolute base */ }
					candidates = parts.filter(p => p !== htmlPart && p.location && (p.location === ref || p.location === absolute));
				}
				if (candidates.length > 1) warnings.push({code: 'picture_ambiguous', dest: ref, message: 'Multiple MIME parts claim this picture; the original reference was kept.'});
				return candidates.length === 1 ? candidates[0] : null;
			};
			const fallback = basenameOf(f.name).replace(/\.mht(ml)?$/i, '');
			let noteText = noteFromHtml(textOfPart(htmlPart, warnings), fallback, ref => {
				const part = findPartByRef(ref);
				if (!part) return null;
				if (!partsUsed.has(part)) {
					partsUsed.add(part);
					const base = basenameOf(part.location) || (part.id ? part.id.replace(/[^A-Za-z0-9._-]/g, '') : 'picture') || 'picture';
					const named = /\.[a-z0-9]{2,5}$/i.test(base) ? base : base + '.' + (part.type.split('/')[1] || 'bin');
					part.finalName = uniquePictureName(named, usedPictureNames);
					pictures.push({name: part.finalName, sourceName: dirOf(f.name) + part.finalName, rootId: f.rootId ?? '', bytes: part.bytes, mime: part.type || mimeFor(named)});
				}
				return {name: part.finalName};
			}, warnings);
			// Retain every other MIME part. Existing <a> links bind to their exact part;
			// unreferenced parts get an ordinary link too, not an invisible discard.
			const links = scanLinks(noteText);
			for (const part of parts) if (part !== htmlPart && !partsUsed.has(part)) {
				const base = basenameOf(part.location) || (part.id ? part.id.replace(/[^A-Za-z0-9._-]/g, '') : '') || 'attachment';
				const named = /\.[a-z0-9]{1,24}$/i.test(base) ? base : base + '.' + (part.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin');
				const name = uniquePictureName(named, usedPictureNames);
				const references = links.filter(link => findPartByRef(link.dest) === part).map(link => link.dest);
				attachments.push({name, sourceName: dirOf(f.name) + name, ownerSource: f.name, sourceAliases: references, rootId: f.rootId ?? '', bytes: part.bytes, mime: part.type});
				if (!references.length) noteText = addSiblingLinkLine(noteText, '[' + name.replace(/[\\`*_{}\[\]<>!|]/g, '\\$&') + '](' + encodeURIComponent(name).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16)) + ')');
			}

			const file = noteFileName(noteText, pool); pool.push(file);
			const headDate = new Date(headerValue(text.slice(0, 2000), 'Date')).getTime();
			const mhtEntry = {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: ''};
			if (Number.isFinite(headDate)) { mhtEntry.modified = headDate; warnings.push({code: 'mime_date', message: 'The MIME archive date is used for this note. The export does not establish its original creation or edit time.'}); }
			built.push({file, text: noteText, sourceName: f.name, rootId: f.rootId ?? '', warnings, entry: mhtEntry, created: Number.isFinite(headDate) ? headDate : -Infinity});
		} catch (_) {
			built.push({...literalImportSource({...f, text, bytes: undefined}, pool, 'The HTML or MIME structure could not be converted.', warnings, kind === 'html' ? 'html' : 'text'), created: -Infinity});
		}
	}

	// Order exactly as notes/takeout.mjs: newest known timestamp leads (an .mht's own Date header);
	// everything with no discoverable timestamp -- essentially all of it -- keeps its encounter order,
	// landing after whatever is already in the folder, since a stable sort never reorders equal keys.
	const byNewest = built.slice().sort((a, b) => b.created - a.created);
	let last = lastOrder;
	for (const n of byNewest) { last = orderAfter(last); n.entry.order = last; if (Number.isFinite(n.created) && n.entry.created === undefined) n.entry.created = Math.round(n.created); }

	return finishImportCharacters({notes: built.map(({created, ...note}) => note), skipped, sections, pictures, attachments});
}
