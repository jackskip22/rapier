// notes/import-enex.mjs -- turning an Evernote .enex export into ordinary Rapier notes. One .enex is
// one notebook (dev.evernote.com/doc/articles/note_export.php; the export DTD at
// xml.evernote.com/pub/evernote-export3.dtd, the note body language ENML2 at .../enml2.dtd -- both
// fetched and read while building this), an XML document rooted at <en-export> holding one or more
// <note>. A note's <content> is ENML (an XHTML-shaped markup: div/p/ul/ol/table/b/i/u/... plus three
// Evernote-only elements) wrapped in CDATA, so it goes through notes/html-md.mjs, the same walk any
// other markup source uses. The three ENML-only elements have no HTML equivalent for html-md.mjs to
// know about, so they are swapped for inert \x01-sentinels before that walk and resolved back into
// Markdown after it, in the note's own final text -- html-md.mjs stays Evernote-ignorant.
//
// Pure: no DOM (this file writes its own small, tolerant XML tree-walk -- the same tolerance
// html-md.mjs's tokenizer has, applied to XML: an unmatched close tag is ignored), no fs, no fetch.
// Imports only ./model.mjs, ./zip.mjs and ./html-md.mjs, exactly as the brief requires.
import {noteFileName, orderAfter} from './model.mjs';
import {zipOversizeSkip} from './zip.mjs';
import {htmlToMarkdown} from './html-md.mjs';
import {audioMime, appendImportedRecording} from './audio.mjs';
import {expandImportZips, importTags, literalInline, literalDestination, importMetadata, importAlarm, uniquePictureName} from './import.mjs';
import {readImportText, reportCharacterChange, finishImportCharacters} from './import-characters.mjs';

// ---- A small tolerant XML tree, independent of html-md.mjs's HTML one: XML's self-closing tag is
// always explicit ("/>"), so there is no VOID-tag guessing, and CDATA is the load-bearing feature
// (a note's whole ENML body arrives as one CDATA section). -----------------------------------------
const XML_ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
function decodeXml(s) {
	return String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e) => {
		if (e[0] !== '#') return XML_ENTITIES[e] ?? m;
		const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
		return Number.isFinite(code) && code >= 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF) ? String.fromCodePoint(code) : m;
	});
}
function parseXmlAttrs(raw) {
	const attrs = {}, re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
	let m;
	while ((m = re.exec(raw))) attrs[m[1].toLowerCase()] = decodeXml(m[2] ?? m[3] ?? '');
	return attrs;
}
function parseXml(src) {
	const s = String(src), n = s.length, root = {tag: '#root', attrs: {}, children: []}, stack = [root];
	let i = 0;
	while (i < n) {
		const lt = s.indexOf('<', i);
		if (lt < 0) { if (i < n) stack[stack.length - 1].children.push(decodeXml(s.slice(i))); break; }
		if (lt > i) stack[stack.length - 1].children.push(decodeXml(s.slice(i, lt)));
		if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
		if (s.startsWith('<![CDATA[', lt)) { const e = s.indexOf(']]>', lt + 9); stack[stack.length - 1].children.push(s.slice(lt + 9, e < 0 ? n : e)); i = e < 0 ? n : e + 3; continue; } // literal: never entity-decoded
		if (s[lt + 1] === '?' || s[lt + 1] === '!') { const e = s.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; } // PI/DOCTYPE, dropped
		let j = lt + 1, close = false;
		if (s[j] === '/') { close = true; j++; }
		const nameStart = j;
		while (j < n && /[a-zA-Z0-9:_-]/.test(s[j])) j++;
		const name = s.slice(nameStart, j).toLowerCase();
		if (!name) { i = lt + 1; continue; }
		let quote = '';
		while (j < n) { const c = s[j]; if (quote) { if (c === quote) quote = ''; j++; continue; } if (c === '"' || c === "'") { quote = c; j++; continue; } if (c === '>') break; j++; }
		const attrsRaw = s.slice(nameStart + name.length, j);
		i = j + 1;
		if (close) { for (let k = stack.length - 1; k >= 1; k--) if (stack[k].tag === name) { stack.length = k; break; } continue; }
		const node = {tag: name, attrs: parseXmlAttrs(attrsRaw), children: []};
		stack[stack.length - 1].children.push(node);
		if (!/\/\s*$/.test(attrsRaw)) stack.push(node);
	}
	return root;
}
const child = (node, tag) => (node?.children || []).find(c => c && typeof c === 'object' && c.tag === tag) || null;
const allChildren = (node, tag) => (node?.children || []).filter(c => c && typeof c === 'object' && c.tag === tag);
const textOf = node => !node ? '' : (node.children || []).map(c => typeof c === 'string' ? c : textOf(c)).join('');

// Non-ENML title and source-URL fields use the shared literal import grammar.
// "20260916T120000Z" -> ms. Evernote's own timestamp form (DTD: created/updated are ISO 8601, and
// this compact basic form is what the export actually writes).
function enDate(s) {
	const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(s || ''));
	if (!m) return NaN;
	const iso = m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6] + '.000Z', at = Date.parse(iso);
	return Number.isFinite(at) && new Date(at).toISOString() === iso ? at : NaN;
}

// ---- MD5, for matching an <en-media hash> against a <resource>'s own decoded bytes. Evernote's
// hash is the resource's plain MD5, hex, lowercase (dev.evernote.com/doc/articles/note_export.php).
const MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const MD5_K = Array.from({length: 64}, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
const rotl = (x, c) => (x << c) | (x >>> (32 - c));
function md5Hex(bytes) {
	const withOne = bytes.length + 1, padLen = (withOne + 8 + 63) & ~63;
	const buf = new Uint8Array(padLen);
	buf.set(bytes); buf[bytes.length] = 0x80;
	const view = new DataView(buf.buffer);
	view.setUint32(padLen - 8, (bytes.length * 8) >>> 0, true);
	view.setUint32(padLen - 4, Math.floor(bytes.length / 0x20000000), true);
	let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
	for (let off = 0; off < padLen; off += 64) {
		const M = new Array(16);
		for (let i = 0; i < 16; i++) M[i] = view.getUint32(off + i * 4, true);
		let A = a0, B = b0, C = c0, D = d0;
		for (let i = 0; i < 64; i++) {
			let F, g;
			if (i < 16) { F = (B & C) | (~B & D); g = i; }
			else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
			else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
			else { F = C ^ (B | ~D); g = (7 * i) % 16; }
			F = (F + A + MD5_K[i] + M[g]) >>> 0;
			A = D; D = C; C = B; B = (B + rotl(F, MD5_S[i])) >>> 0;
		}
		a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
	}
	const out = new Uint8Array(16), dv = new DataView(out.buffer);
	dv.setUint32(0, a0, true); dv.setUint32(4, b0, true); dv.setUint32(8, c0, true); dv.setUint32(12, d0, true);
	return Array.from(out, b => b.toString(16).padStart(2, '0')).join('');
}

const MIME_EXT = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
	'image/heic': 'heic', 'application/pdf': 'pdf', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav',
	'video/mp4': 'mp4', 'video/quicktime': 'mov', 'text/plain': 'txt'};
function extFor(mime) {
	const m = String(mime || '').toLowerCase().split(';')[0].trim();
	if (MIME_EXT[m]) return MIME_EXT[m];
	const safe = (m.split('/')[1] || '').replace(/[^a-z0-9]/g, '').slice(0, 8);
	return safe || 'bin';
}
// Decode a <resource>'s base64 <data> (the CDATA text is pretty-printed with embedded whitespace),
// and resolve its file name: resource-attributes/file-name when the export set one, else
// <hash>.<ext from mime> -- the DTD's own fallback shape (section 2 of the research this follows).
function resourceOf(node, used) {
	const data = child(node, 'data');
	if (!data || data.attrs.encoding && data.attrs.encoding.toLowerCase() !== 'base64') return null;
	const dataText = textOf(data).replace(/\s+/g, '');
	let bytes;
	try { bytes = Uint8Array.from(atob(dataText), c => c.charCodeAt(0)); } catch (_) { return null; }
	const mime = textOf(child(node, 'mime')).trim() || 'application/octet-stream';
	const hash = md5Hex(bytes);
	const attrs = child(node, 'resource-attributes');
	const named = attrs && textOf(child(attrs, 'file-name')).trim();
	const base = (named ? named.split(/[\\/]/).pop().trim() : '') || (hash + '.' + extFor(mime));
	return {hash, name: uniquePictureName(base, used), bytes, mime};
}

// ---- ENML -> Markdown: swap the three Evernote-only elements for sentinels no mark character can
// touch (html-md.mjs's own escaping leaves \x01 alone), walk with html-md.mjs, then resolve the
// sentinels in the finished Markdown -- html-md.mjs never learns Evernote's tag names. ---------------
// Every decoded resource is retained in the result; the picture pass decides whether it embeds.
function contentToMarkdown(enml, resources, warnings) {
	let xml = String(enml);
	// The input owns every character, even our old placeholder spelling or its entity form.
	const decoded = decodeXml(xml);
	let prefix = '\x01RAPIER';
	while (xml.includes(prefix) || decoded.includes(prefix)) prefix += 'X';
	prefix += ':';
	const kept = [];
	const keep = (source, code, message) => {
		warnings.push({code, message});
		const fence = '`'.repeat(Math.max(3, 1 + Math.max(0, ...(source.match(/`+/g) || []).map(s => s.length))));
		kept.push(fence + 'xml\n' + source + '\n' + fence);
		return prefix + 'KEPT' + (kept.length - 1) + '\x01';
	};
	xml = xml.replace(/<en-crypt\b[^>]*\/>|<en-crypt\b[^>]*>[\s\S]*?<\/en-crypt>/gi, raw => keep(raw, 'encrypted_block', 'Encrypted block kept as literal source; it was not decrypted.'));
	xml = xml.replace(/<en-todo\b([^>]*)\/?>/gi, (_, attrs) =>
		prefix + (/^true$/i.test(parseXmlAttrs(attrs).checked || '') ? 'TODO1' : 'TODO0') + '\x01');
	const media = [];
	xml = xml.replace(/<en-media\b([^>]*?)\/?>(?:<\/en-media>)?/gi, (m, attrsRaw) => {
		const attrs = parseXmlAttrs(attrsRaw);
		const found = attrs.hash && resources.get(attrs.hash.toLowerCase());
		if (!found) return keep(m, 'attachment_missing', 'Attachment bytes were not present for ' + (attrs.hash || 'unnamed resource') + '.');
		media.push(found);
		return prefix + 'MEDIA' + (media.length - 1) + '\x01';
	});
	let text = htmlToMarkdown(xml, {warnings});
	text = text.replace(new RegExp(prefix + 'KEPT(\\d+)\x01', 'g'), (_, i) => '\n\n' + kept[+i] + '\n\n');
	text = text.replace(new RegExp(prefix + 'MEDIA(\\d+)\x01', 'g'), (m, i) => { const r = media[+i]; if (!r) return m; if (audioMime(r.mime, r.name)) return ''; return (/^image\//i.test(r.mime) ? '![](' : '[' + literalInline(r.name) + '](') + literalDestination(encodeURIComponent(r.name)) + ')'; });
	text = text.replace(new RegExp('(^|\\n)([ \t]*(?:[-+*]|[0-9]+[.)]) )' + prefix + 'TODO([01])\x01[ \t]*', 'g'), (_, line, bullet, done) => line + bullet + '[' + (done === '1' ? 'x' : ' ') + '] ');
	text = text.replace(new RegExp(prefix + 'TODO1\x01[ \t]*', 'g'), '- [x] ').replace(new RegExp(prefix + 'TODO0\x01[ \t]*', 'g'), '- [ ] ');
	// Consecutive to-do lines read as one tight list, as takeout.mjs's own checklists do. Captured
	// FORWARD and re-emitted, never matched with a variable-length lookbehind: `(?<=^- \[[ x]\][^\n]*)`
	// has to scan back to the line start from every position inside the line, which is quadratic in
	// the line's length. Measured on one long line that begins like a to-do: 25 KiB 304 ms, 50 KiB
	// 1,199 ms, 100 KiB 4,810 ms, 200 KiB 19,386 ms -- each doubling quadrupling it. This form is
	// 0.13-0.46 ms across the same four, and 50,000 seeded to-do/blank/text sequences give byte-identical
	// output. An Evernote note with one long checklist line is an ordinary export, not a hostile one.
	text = text.replace(/^(- \[[ x]\][^\n]*)\n\n(?=- \[[ x]\])/gm, '$1\n');
	return text;
}

function labelsOf(tagNodes) {
	const out = [], seen = new Set();
	for (const t of tagNodes) {
		const name = textOf(t).trim();
		if (!name || name.length > 100 || seen.has(name) || out.length >= 16) continue; // DTD: 1-100 chars/tag
		seen.add(name); out.push(name);
	}
	return out;
}

export async function importEnex(entries, options) {
	const list = await expandImportZips(Array.isArray(entries) ? entries : []);
	const existing = Array.isArray(options && options.existing) ? options.existing.filter(n => typeof n === 'string') : [];
	const lastOrder = typeof (options && options.lastOrder) === 'string' ? options.lastOrder : '';
	const skipped = [], built = [], pool = existing.slice();
	const sections = [], seenSections = new Set();
	const pictures = [], attachments = [], usedPictureNames = new Set(), audio = [], audioPool = [...(Array.isArray(options?.audioExisting) ? options.audioExisting : [])];

	for (const f of list) {
		if (f?.oversize) { skipped.push(zipOversizeSkip(f)); continue; }
		if (f?.unreadable) { skipped.push({name: f.name, why: f.unreadable}); continue; }
		try {
			if (!f || typeof f.name !== 'string' || !/\.enex$/i.test(f.name)) continue;
			const sourceWarnings = [], text = readImportText(f, sourceWarnings);
			const root = parseXml(text);
			const doc = child(root, 'en-export') || root;
			const noteNodes = allChildren(doc, 'note');
			if (!noteNodes.length) { skipped.push({name: f.name, why: 'not a readable ENEX export (no <note> found)'}); continue; }

			noteNodes.forEach((note, index) => {
				const label = f.name + ' note ' + (index + 1);
				try {
					const warnings = [...sourceWarnings];
					const rawTitle = textOf(child(note, 'title')), title = rawTitle.replace(/\s+/g, ' ').trim();
					reportCharacterChange(rawTitle, title, warnings, 'ENEX title');
					const contentNode = child(note, 'content');
					if (!title && !contentNode) { skipped.push({name: label, why: 'missing title and content'}); return; }

					const resources = new Map();
					const rootId = f.rootId ?? '';
					const resourcePrefix = f.name.includes('/') ? f.name.slice(0, f.name.lastIndexOf('/') + 1) : '';
					for (const r of allChildren(note, 'resource')) {
						let resolved;
						try { resolved = resourceOf(r, usedPictureNames); } catch (_) { resolved = null; }
						if (resolved) {
							resources.set(resolved.hash, resolved);
							if (!audioMime(resolved.mime, resolved.name)) {
								const asset = {...resolved, rootId, sourceName: resourcePrefix + resolved.name};
								(/^image\//i.test(resolved.mime) ? pictures : attachments).push(asset);
							}
						} else warnings.push({code: 'attachment_invalid', message: 'Resource data could not be decoded; the original resource remains in the source export.'});
					}

					const blocks = [];
					if (title) blocks.push('# ' + literalInline(title).replace(/(\s+#+)$/, m => m.replace('#', '\\#')));
					let body = '';
					try { body = contentNode ? contentToMarkdown(textOf(contentNode), resources, warnings) : ''; }
					catch (_) { body = textOf(contentNode); warnings.push({code: 'unsupported_block', message: 'Unparsed ENML retained as source.'}); }
					if (body.trim()) blocks.push(body.trim());
					const attrsNode = child(note, 'note-attributes');
					const sourceUrl = attrsNode && textOf(child(attrsNode, 'source-url')).trim();
					if (sourceUrl) blocks.push('Source: ' + literalInline(sourceUrl));
					// One value per attribute element; application-data repeats, each keyed by its own key
					// attribute (the export DTD), so every entry is kept -- not the last one without its key.
					const elements = (attrsNode?.children || []).filter(node => typeof node === 'object');
					const data = elements.filter(node => node.tag === 'application-data').map(node => [node.attrs.key ?? '', textOf(node)]);
					const attrs = Object.fromEntries([...elements.filter(node => node.tag !== 'application-data').map(node => [node.tag, textOf(node)]),
						...(data.length ? [['application-data', Object.fromEntries(data)]] : [])]);
					// ENEX writes an attribute only when it is set (the DTD's elements are optional): nothing
					// here is an "unset" value of its own beyond the empty ones every export shares.
					importMetadata(attrs, ['source-url','reminder-time','reminder-done-time'], warnings, 'Evernote fields', {labels: {'application-data': 'app data'}});
					let noteText = blocks.join('\n\n').replace(/\r\n?/g, '\n').trimEnd() + '\n';

					const file = noteFileName(noteText, pool);
					pool.push(file);
					for (const source of resources.values()) {
						if (!audioMime(source.mime, source.name)) continue;
						const mapped = appendImportedRecording(noteText, file, source, audioPool);
						noteText = mapped.text; audio.push(mapped.audio); audioPool.push(mapped.audio.name);
					}
					// A <tag> lives in the export's XML, not in the note: it is written into the note's own
					// metadata block so the person keeps it. The capped names are the category's, as before.
					const tagNames = allChildren(note, 'tag').map(node => textOf(node)).filter(Boolean);
					const labels = labelsOf(allChildren(note, 'tag'));
					const entry = {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: ''}; // ENML has no pin/archive/colour field to read
					importAlarm(entry, enDate(attrs['reminder-time']), enDate(attrs['reminder-done-time']), warnings);
					for (const [key, what] of [['reminder-time', 'reminder date'], ['reminder-done-time', 'reminder done date']]) if (attrs[key] && !Number.isFinite(enDate(attrs[key]))) warnings.push({code: 'invalid_time', field: key, value: attrs[key], message: 'The Evernote ' + what + ' could not be read, so no reminder was set. Its value stays in the original export and in this import record.'});
					if (labels.length) {
						entry.category = labels[0];
						const key = labels[0].toLowerCase();
						if (!seenSections.has(key)) { seenSections.add(key); sections.push(labels[0]); }
					}
					const created = enDate(textOf(child(note, 'created')));
					const updated = enDate(textOf(child(note, 'updated')));
					for (const [key, what] of [['created', 'creation date'], ['updated', 'edit date']]) { const value = textOf(child(note, key)); if (value && !Number.isFinite(enDate(value))) warnings.push({code: 'invalid_time', field: key, value, message: 'The Evernote ' + what + ' could not be read, so no date was set. Its value stays in the original export and in this import record.'}); }
					const modified = Number.isFinite(updated) ? updated : Number.isFinite(created) ? created : undefined;
					if (modified !== undefined) entry.modified = modified;
					built.push({file, text: importTags(noteText, tagNames, warnings, label), entry, sourceName: f.name, rootId, sourceItem: label, warnings, created: Number.isFinite(created) ? created : -Infinity});
				} catch (_) {
					skipped.push({name: label, why: 'could not be read'});
				}
			});
		} catch (_) {
			skipped.push({name: f && typeof f.name === 'string' ? f.name : '(unnamed)', why: 'not a readable ENEX export'});
		}
	}

	// Order exactly as notes/takeout.mjs: newest created note in the batch gets the lowest (earliest)
	// key after lastOrder, so a fresh import leads with what was most recently written in Evernote.
	const byNewest = built.slice().sort((a, b) => b.created - a.created);
	let last = lastOrder;
	for (const n of byNewest) { last = orderAfter(last); n.entry.order = last; if (Number.isFinite(n.created) && n.entry.created === undefined) n.entry.created = Math.round(n.created); }

	return finishImportCharacters({notes: built.map(({created, ...note}) => note), skipped, sections, pictures, attachments, audio});
}
