import {parseFrontMatter, tagsOf} from './frontmatter.mjs';
import {cardHead, cardSource, sectionOf, isCodeFile, projectCard, cutText, graphemes} from './model.mjs';
import {recordingsOf} from './audio.mjs';
import {attachmentsOf} from './attachments.mjs';
import {scanLinks, linkMask, hasHtmlTag, headingAnchors, isLineStart, asMap, projectLinks, stageLinkIndex, stageLinkNote, packLinkProjection} from './links.mjs';
import {documentAssets, IMAGE_LIMITS, markdownParser, configureParser, installMarkdownImages} from '../spec/md-assets.mjs';
import {RAPIER_MARKDOWN_SPEC, applyMarkdownSpec, installMarkdownMath, splitOpeningFrontmatter} from '../agent/markdown-spec.mjs';
import {libraryReadRow} from './library-reads.mjs';

const BYTE_PAYLOAD_STUB = 'A'.repeat(128);
const ascii = bytes => String.fromCharCode(...bytes);
function searchByteLinkMap(ranges) {
	const point = n => {
		if (!Number.isInteger(n)) return n;
		let shift = 0;
		for (const row of ranges) {
			if (n < row.at + row.length) break;
			shift += row.end - row.start - row.length;
		}
		return n + shift;
	};
	return link => {
		const row = {...link};
		for (const key of ['start', 'end', 'destStart', 'destEnd', 'altStart', 'altEnd']) if (key in row) row[key] = point(row[key]);
		if (row.definition) row.definition = {start: point(row.definition.start), end: point(row.definition.end)};
		const payload = ranges.find(range => range.urlAt === link.destStart);
		if (payload && /^data:/i.test(row.dest || '')) row.dest = payload.prefix;
		return row;
	};
}

export function projectSearchBytes(input, {file = '', parser, decode = bytes => new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes)} = {}) {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	if (isCodeFile(file)) return {searchText: decode(bytes), textRanges: bytes.length ? [{start: 0, end: bytes.length}] : [],
		payloadRanges: [], mapLink: searchByteLinkMap([])};
	const candidates = [];
	if (bytes.length <= IMAGE_LIMITS.sourceChars) for (let colon = bytes.indexOf(58, 4); colon >= 0; colon = bytes.indexOf(58, colon + 1)) {
		const urlStart = colon - 4;
		if ((bytes[urlStart] | 32) !== 100 || (bytes[urlStart + 1] | 32) !== 97 || (bytes[urlStart + 2] | 32) !== 116 || (bytes[urlStart + 3] | 32) !== 97) continue;
		let start = colon + 1;
		while (start < Math.min(bytes.length, colon + 40) && bytes[start] !== 44 && bytes[start] < 128) start++;
		if (bytes[start] !== 44 || !/^data:image\/(?:jxl|png|jpeg|webp|svg\+xml);base64,$/i.test(ascii(bytes.subarray(urlStart, ++start)))) continue;
		let end = bytes.length;
		for (const b of [10, 13]) {
			const at = bytes.indexOf(b, start);
			if (at >= 0 && at < end) end = at;
		}
		const closerFrom = end - start < 0x10000 ? start : Math.max(start, end - 256);
		const span = bytes.subarray(closerFrom, end);
		for (const b of [9, 32, 34, 39, 40, 41, 60, 62, 91, 92, 93]) {
			const at = span.indexOf(b);
			if (at >= 0 && closerFrom + at < end) end = closerFrom + at;
		}
		let padding = 0, padAt = end;
		while (padAt > start && bytes[padAt - 1] === 61) { padAt--; padding++; }
		const length = end - start;
		if (length <= BYTE_PAYLOAD_STUB.length || length % 4 || padding > 2 || length / 4 * 3 - padding > IMAGE_LIMITS.bytes) continue;
		candidates.push({start, end, urlStart}); colon = end - 1;
	}
	let accepted = candidates;
	for (;;) {
		const parts = [], textRanges = [], payloadRanges = []; let end = 0, at = 0;
		for (const candidate of accepted) {
			if (candidate.start > end) { const part = decode(bytes.subarray(end, candidate.start)); parts.push(part); at += part.length; textRanges.push({start: end, end: candidate.start}); }
			payloadRanges.push({...candidate, at, length: BYTE_PAYLOAD_STUB.length, urlAt: at - candidate.start + candidate.urlStart,
				prefix: ascii(bytes.subarray(candidate.urlStart, candidate.urlStart + 96))});
			parts.push(BYTE_PAYLOAD_STUB); at += BYTE_PAYLOAD_STUB.length; end = candidate.end;
		}
		if (end < bytes.length) { parts.push(decode(bytes.subarray(end))); textRanges.push({start: end, end: bytes.length}); }
		const searchText = parts.join('');
		if (!accepted.length) return {searchText, textRanges, payloadRanges, mapLink: searchByteLinkMap(payloadRanges)};
		let blocks;
		try { blocks = documentAssets(searchText, parser).blocks; } catch (_) { accepted = []; continue; }
		const headingLines = headingAnchors(searchText).map(heading => ({start: heading.start,
			end: Math.min(...['\r', '\n'].map(eol => { const end = searchText.indexOf(eol, heading.start); return end < 0 ? searchText.length : end; }))}));
		const approved = payloadRanges.filter(row => blocks.some(block => block.payloadStart === row.at && block.payloadEnd === row.at + row.length) &&
			!headingLines.some(line => line.start <= row.at && row.at < line.end));
		if (approved.length === accepted.length) return {searchText, textRanges, payloadRanges, mapLink: searchByteLinkMap(payloadRanges)};
		accepted = approved;
	}
}

const WEIGHT = {title: 8, headings: 4, tags: 3, body: 1, pictures: 1}, FIELDS = ['title', 'headings', 'tags', 'body'];
const PICTURE_FIELDS = [...FIELDS, 'pictures'];
const fieldsOf = (bag, pictures = true) => pictures && bag.pictures ? PICTURE_FIELDS : FIELDS;
export const SEARCH_EXCERPT_CHARS = 80;
function copyText(s) { return s.split('').join(''); }
function boundedExcerpt(text) { return copyText(cutText(String(text ?? ''), SEARCH_EXCERPT_CHARS, SEARCH_EXCERPT_CHARS)); }
function indexNote(proj, file, bag) {
	const {body, excerpt, ...fields} = proj;
	if (fields.pictures) fields.pictures = copyText(fields.pictures);
	const kept = body != null ? boundedExcerpt(body) : boundedExcerpt(excerpt);
	return {...fields, title: copyText(fields.title),
		headings: fields.headings.map(h => ({...h, text: copyText(h.text), slug: copyText(h.slug)})),
		tags: fields.tags.map(copyText), excerpt: kept, file, bag};
}
const ASSET_TOKEN = '\uFFFC', DATA_URL = /data:[a-zA-Z0-9.+\/+-]+;base64,([A-Za-z0-9+/=\s]+)/y;
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|jxl|bmp|ico)$/i;

const ACCENTED = /([\p{sc=Latin}\p{sc=Greek}\p{sc=Cyrillic}\p{sc=Arabic}\p{sc=Hebrew}])\p{M}+/gu;
function fold(s) {
	s = String(s ?? '');
	return /[^\x00-\x7f]/.test(s) ? s.normalize('NFD').replace(ACCENTED, '$1').toLowerCase().replace(/[‘’]/g, "'").replace(/ß/g, 'ss') : s.toLowerCase();
}
let wordSegmenter;
function wordSegments(s) {
	if (typeof globalThis.Intl?.Segmenter !== 'function') throw new Error('Search needs a newer browser. Update your browser and try again.');
	wordSegmenter ||= new Intl.Segmenter(undefined, {granularity: 'word'});
	return wordSegmenter.segment(String(s ?? ''));
}
function wordsOf(s) {
	const words = [];
	for (const part of wordSegments(s)) if (part.isWordLike) words.push(part.segment);
	return words;
}


function lineIsHeading(text, i) {
	let j = i, sp = 0;
	while (text[j] === ' ' && sp < 3) { j++; sp++; }
	let n = 0; while (text[j] === '#') { j++; n++; }
	return n >= 1 && n <= 6 && (text[j] === ' ' || text[j] === '\t');
}

function bodyTags(text, mask, from = 0) {
	const tags = [];
	let i = from;
	if (i === 0 && text[0] === '\uFEFF') i = 1;
	let h = text.indexOf('#', i);
	while (i < text.length && h >= 0) {
		if (!isLineStart(text, i)) { i++; continue; }
		const end = lineEnd(text, i);
		if (h >= end) { i = end + 1; continue; }
		if (mask[i] || lineIsHeading(text, i)) { i = end + 1; h = text.indexOf('#', i); continue; }
		for (let p = h; p >= 0 && p < end; p = text.indexOf('#', p + 1)) {
			if (mask[p]) continue;
			const prev = p === 0 ? ' ' : text[p - 1];
			if (/[\p{L}\p{N}_]/u.test(prev)) continue;
			if (text[p + 1] === ' ' || text[p + 1] === '\t' || text[p + 1] === '#' || text[p + 1] == null) continue;
			let j = p + 1, closed = false;
			while (j < end && !mask[j]) {
				if (text[j] === '#') { closed = true; break; }
				j++;
			}
			const inner = text.slice(p + 1, j).trim();
			if (!inner) continue;
			tags.push(closed && inner.includes(' ') ? inner : inner.split(/\s/)[0]);
			p = closed ? j : p + tags[tags.length - 1].length;
		}
		i = end + 1; h = text.indexOf('#', i);
	}
	return tags;
}

const LINE_END = /[\r\n]/g; let crText = null, crHas = false;
function lineEnd(s, i) {
	if (s !== crText) { crText = s; crHas = s.indexOf('\r') >= 0; }
	if (!crHas) { const n = s.indexOf('\n', i); return n < 0 ? s.length : n; }
	LINE_END.lastIndex = i; const m = LINE_END.exec(s); i = m ? m.index : s.length;
	return s[i] === '\r' && s[i + 1] === '\n' ? i + 1 : i;
}

function maskKind(s, i) {
	if (s.startsWith('<!--', i)) return 'comment';
	if (s[i] === '<' && !/^<https?:/i.test(s.slice(i, i + 12))) return 'html';
	if ((s[i] === '`' || s[i] === '~') && isLineStart(s, i)) return 'fence';
	return 'code';
}

function stripFence(block) {
	const lines = block.split(/\r\n|\r|\n/);
	if (lines.length && /^ {0,3}(?:`{3,}|~{3,})/.test(lines[0].replace(/\r$/, ''))) lines.shift();
	if (lines.length && /^ {0,3}(?:`{3,}|~{3,})\s*$/.test(lines[lines.length - 1].replace(/\r$/, ''))) lines.pop();
	return lines.join('\n');
}

function emitEmphasis(ch, prev, next) {
	if (ch === '*' || ch === '~') return false;
	if (ch === '_' && !((prev && /[\p{L}\p{N}]/u.test(prev)) && (next && /[\p{L}\p{N}]/u.test(next)))) return false;
	return true;
}

function projectBody(text, mask, links, from = 0, omit = null) {
	let body = '';
	const next = /[\r\n`<\[*_~]|!\[|data:/g;
	const atLink = new Map();
	for (const L of links) if (!atLink.has(L.start)) atLink.set(L.start, L);
	let i = from;
	while (i < text.length) {
		if (omit && i >= omit.from && i < omit.to) { body += text.slice(i, omit.to).replace(/[^\r\n]/g, ''); i = omit.to; continue; }
		if (mask[i]) {
			const end = mask.indexOf(0, i), j = end < 0 ? text.length : end;
			const kind = maskKind(text, i);
			if (kind === 'comment' || kind === 'html') { i = j; continue; }
			const chunk = kind === 'fence' ? stripFence(text.slice(i, j)) : text.slice(i, j).replace(/`+/g, '');
			body += chunk;
			i = j;
			continue;
		}
		if (isLineStart(text, i) && lineIsHeading(text, i)) {
			let j = i, sp = 0;
			while (text[j] === ' ' && sp < 3) { j++; sp++; }
			while (text[j] === '#') j++;
			if (text[j] === ' ' || text[j] === '\t') j++;
			i = j;
			continue;
		}
		if (text.startsWith('data:', i)) {
			DATA_URL.lastIndex = i; const m = DATA_URL.exec(text);
			if (m && m[1].replace(/\s/g, '').length > 64) { body += ASSET_TOKEN; i += m[0].length; continue; }
		}
		const L = atLink.get(i);
		if (L) {
			if (L.kind === 'inline' || L.kind === 'reference' || L.kind === 'wikilink' || L.kind === 'embed') body += (L.text || '') + ' ';
			else body += L.text || '';
			i = L.end;
			continue;
		}
		const ch = text[i];
		if (!emitEmphasis(ch, text[i - 1], text[i + 1])) { i++; continue; }
		if (ch === '\r' || ch === '\n' || i === 0 && ch === '\uFEFF') { body += ch; i++; continue; }
		next.lastIndex = i + 1;
		const hit = next.exec(text), end = hit ? hit.index : text.length;
		body += text.slice(i, end);
		i = end;
	}
	return body.replace(/[A-Za-z0-9+/]{65,}={0,2}/g, ASSET_TOKEN);
}

function countTasks(text) {
	let open = 0, done = 0;
	if (text.indexOf('[ ]') < 0 && text.indexOf('[x]') < 0 && text.indexOf('[X]') < 0) return {open, done};
	const parser = markdownParser(), tokens = [];
	const body = parseFrontMatter(text).body.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\0/g, '\ufffd');
	parser.block.parse(body, parser, {}, tokens);
	for (let i = 2; i < tokens.length; i++) {
		if (tokens[i].type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') continue;
		const m = /^\[( |x|X)\](?=[ \t]|$)/.exec(tokens[i].content);
		if (m) { if (m[1] === ' ') open++; else done++; }
	}
	return {open, done};
}

export function projectText(text, entry = {}, file = '', snippet = false) {
	const derived = typeof text?.searchText === 'string' && typeof text.mapLink === 'function' ? text : null;
	const s = derived ? derived.searchText : String(text ?? '');
	if (isCodeFile(file)) return {title: file, headings: [], body: s, tags: [], tasks: {open: 0, done: 0},
		hasPicture: false, hasDrawing: false, hasLink: false, ...searchEntry(entry)};
	const {body: rest} = parseFrontMatter(s);
	const restAt = s.length - rest.length;
	const mask = linkMask(s);
	const links = scanLinks(s);
	const source = snippet ? cardSource(s) : null;
	const head = source ? cardHead(source.visible, source.lines) : cardHead(rest.replace(/\r\n?/g, '\n').split('\n'));
	const title = head.title;
	const heads = headingAnchors(s).filter(h => h.text && h.text !== title).map(h => derived ? derived.mapLink(h) : h);
	const tags = [...tagsOf(s), ...bodyTags(s, mask, restAt)];
	const seen = new Set();
	const tagList = [];
	for (const t of tags) {
		const k = fold(t);
		if (!k || seen.has(k)) continue;
		seen.add(k);
		tagList.push(t.replace(/^#/, ''));
	}
	let omit = null;
	if (source && head.title) {
		const from = source.pieces.slice(0, head.at).reduce((n, line) => n + line.length, 0);
		omit = {from, to: from + source.pieces.slice(head.at, head.start).reduce((n, line) => n + line.length, 0)};
	}
	const body = projectBody(s, mask, links, restAt, omit);
	const tasks = countTasks(s);
	let hasPicture = false, hasDrawing = false, hasLink = false;
	for (const L of links) {
		const d = (L.dest || '').split('?')[0].split('#')[0];
		const dest = L.dest || '';
		const svg = /\.svg$/i.test(d) || /^data:image\/svg/i.test(dest);
		const raster = IMAGE_EXT.test(d) && !svg || /^data:image\/(?!svg)/i.test(dest);
		const bang = L.kind === 'inline' && s[L.start] === '!';
		if (svg) hasDrawing = true;
		if (raster || (bang && /^data:image\//i.test(dest) && !svg)) hasPicture = true;
		if (L.kind === 'wikilink' || (L.kind === 'embed' && !svg && !raster)) hasLink = true;
		if ((L.kind === 'inline' || L.kind === 'reference' || L.kind === 'html') && !L.image && !bang && !raster && !svg && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(dest)) hasLink = true;
	}
	if (body.includes(ASSET_TOKEN) && !hasDrawing) hasPicture = true;
	if (hasHtmlTag(s, 'svg')) hasDrawing = true;
	crText = null;
	const media = {};
	if (recordingsOf(s, links).length) media.hasRecording = true;
	if (attachmentsOf(s, links).length) media.hasFile = true;
	return {title, headings: heads, body, tags: tagList, tasks, hasPicture, hasDrawing, hasLink, ...media, ...searchEntry(entry)};
}

function searchEntry(entry) {
	const e = entry && typeof entry === 'object' ? entry : {};
	return {
		category: typeof e.category === 'string' ? e.category : '',
		pinned: e.pinned === true,
		archived: e.archived === true,
		trashed: e.trashed === true,
		remind: e.remind && typeof e.remind === 'object' ? e.remind : null,
		colour: typeof e.colour === 'string' ? e.colour : '',
		created: Number.isFinite(e.created) ? e.created : null,
		modified: Number.isFinite(e.modified) ? e.modified : null,
	};
}

function withPictures(proj, words) {
	if (typeof words === 'string' && words.trim()) proj.pictures = words;
	return proj;
}
const picturesOf = (holder, file) => typeof holder?.pictures?.get === 'function' ? holder.pictures.get(file) : undefined;

export function packSearchProjection(note) {
	const row = [note.title, note.headings.map(h => [h.slug, h.text, h.level, h.start]), note.tags.slice(),
		[note.tasks.open, note.tasks.done], note.hasPicture, note.hasDrawing, note.hasLink,
		FIELDS.map(field => [...note.bag[field]]), (note.hasRecording ? 1 : 0) | (note.hasFile ? 2 : 0)];
	if (note.pictures && note.bag.pictures) row.push([note.pictures, [...note.bag.pictures]]);
	row.push(typeof note.excerpt === 'string' ? note.excerpt : '');
	return row;
}

export function unpackSearchProjection(value) {
	const uint = n => Number.isSafeInteger(n) && n >= 0;
	if (!Array.isArray(value) || (value.length !== 10 && value.length !== 11)) return null;
	const excerpt = value[value.length - 1];
	if (typeof excerpt !== 'string' || excerpt.length > SEARCH_EXCERPT_CHARS) return null;
	const row = value.slice(0, -1);
	const [title, heads, tags, tasks, hasPicture, hasDrawing, hasLink, bags, media, seen] = row;
	if (row.length === 10 && (!Array.isArray(seen) || seen.length !== 2 || typeof seen[0] !== 'string' || !seen[0].trim() || !Array.isArray(seen[1]))) return null;
	if (!uint(media) || media > 3) return null;
	if (typeof title !== 'string' || !Array.isArray(heads) || !heads.every(h => Array.isArray(h) && h.length === 4 &&
		typeof h[0] === 'string' && typeof h[1] === 'string' && Number.isInteger(h[2]) && h[2] >= 1 && h[2] <= 6 && uint(h[3])) ||
		!Array.isArray(tags) || !tags.every(t => typeof t === 'string') || !Array.isArray(tasks) || tasks.length !== 2 || !tasks.every(uint) ||
		![hasPicture, hasDrawing, hasLink].every(b => typeof b === 'boolean') || !Array.isArray(bags) || bags.length !== 4) return null;
	const bag = {};
	const counts = list => {
		if (!Array.isArray(list)) return null;
		const words = new Map();
		for (const pair of list) {
			if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !/[\p{L}\p{N}]/u.test(pair[0]) || /\s/u.test(pair[0]) ||
				fold(pair[0]) !== pair[0] || !uint(pair[1]) || pair[1] === 0 || words.has(pair[0])) return null;
			words.set(pair[0], pair[1]);
		}
		return words;
	};
	for (const [i, field] of FIELDS.entries()) {
		const words = counts(bags[i]);
		if (!words) return null;
		bag[field] = words;
	}
	if (seen) { const words = counts(seen[1]); if (!words || !words.size) return null; bag.pictures = words; }
	return {title, headings: heads.map(([slug, text, level, start]) => ({slug, text, level, start})), tags: tags.slice(),
		tasks: {open: tasks[0], done: tasks[1]}, hasPicture, hasDrawing, hasLink,
		...(media & 1 ? {hasRecording: true} : {}), ...(media & 2 ? {hasFile: true} : {}), ...(seen ? {pictures: seen[0]} : {}), excerpt, bag};
}

function counted(texts) {
	const m = new Map();
	for (const text of texts) for (const part of wordSegments(text)) if (part.isWordLike) {
		const w = fold(part.segment), count = m.get(w);
		if (count === undefined) m.set(copyText(w), 1); else m.set(w, count + 1);
	}
	return m;
}
function* tokenBagWalk(proj) {
	const bag = {}, texts = {title: [proj.title], headings: [proj.headings.map(h => h.text).join(' ')], tags: proj.tags,
		body: [proj.body.replaceAll(ASSET_TOKEN, ' ')], ...(proj.pictures ? {pictures: [proj.pictures]} : {})};
	let walked = 0;
	for (const field of Object.keys(texts)) {
		const words = new Map();
		for (const text of texts[field]) for (const part of wordSegments(text)) {
			if (part.isWordLike) {
				const word = fold(part.segment), count = words.get(word);
				if (count === undefined) words.set(copyText(word), 1); else words.set(word, count + 1);
			}
			if (++walked % 128 === 0) yield;
		}
		if (field !== 'pictures' || words.size) bag[field] = words;
	}
	return bag;
}
function tokenBag(proj) { const walk = tokenBagWalk(proj); let row; do { row = walk.next(); } while (!row.done); return row.value; }

function addPostings(postings, file, bag, owned) {
	for (const field of fieldsOf(bag)) {
		for (const [tok, count] of bag[field]) {
			let inner = postings.get(tok);
			if (owned && !owned.has(tok)) {
				inner = inner ? new Map(inner) : new Map();
				postings.set(tok, inner);
				owned.add(tok);
			} else if (!inner) { inner = new Map(); postings.set(tok, inner); }
			let rec = inner.get(file);
			if (!rec) { rec = {title: 0, headings: 0, tags: 0, body: 0}; inner.set(file, rec); }
			rec[field] = (rec[field] || 0) + count;
		}
	}
}

function removeFilePostings(postings, file, bag, owned) {
	if (!bag) return;
	const seen = new Set();
	for (const field of fieldsOf(bag)) {
		for (const tok of bag[field].keys()) {
			if (seen.has(tok)) continue;
			seen.add(tok);
			const inner = postings.get(tok);
			if (!inner || !inner.has(file)) continue;
			const next = owned ? new Map(inner) : inner;
			if (owned) owned.add(tok);
			next.delete(file);
			if (next.size) postings.set(tok, next); else postings.delete(tok);
		}
	}
}

export function buildSearchIndex(texts, index = {}, {pictures = null} = {}) {
	const map = asMap(texts);
	const notes = new Map();
	const postings = new Map();
	const sidecar = index && typeof index === 'object' ? index : {};
	for (const [file, text] of map) {
		const entry = sidecar.notes && sidecar.notes[file] || {};
		const proj = withPictures(projectText(text, entry, file), picturesOf({pictures}, file));
		const bag = tokenBag(proj);
		notes.set(file, indexNote(proj, file, bag));
		addPostings(postings, file, bag);
	}
	return {notes, postings, sections: Array.isArray(sidecar.sections) ? sidecar.sections : [], sidecar, ...(pictures ? {pictures} : {})};
}

function slicedState(index, pending) {
	const {notes, postings, sections, sidecar, pictures} = index;
	const done = pending.size === 0;
	const sidx = {notes, postings, sections, sidecar, ...(pictures ? {pictures} : {})};
	if (!done) {
		sidx.partial = true;
		sidx.progress = {done: notes.size, total: notes.size + pending.size};
	}
	return {index: sidx, pending, done};
}

export function beginSearchIndex(texts, index = {}, {pictures = null} = {}) {
	const sidecar = index && typeof index === 'object' ? index : {};
	return slicedState({notes: new Map(), postings: new Map(),
		sections: Array.isArray(sidecar.sections) ? sidecar.sections : [], sidecar, ...(pictures ? {pictures} : {})}, new Map(asMap(texts)));
}

export function hydrateSearchIndex(state, reuse, {own = false} = {}) {
	const notes = own ? state.index.notes : new Map(state.index.notes);
	const postings = own ? state.index.postings : new Map(state.index.postings), owned = own ? null : new Set();
	for (const {file, projection: {search: projection}} of reuse) {
		if (notes.has(file) || state.pending.has(file)) continue;
		const entry = state.index.sidecar?.notes?.[file] || {};
		const note = indexNote({...projection, ...searchEntry(entry)}, file, projection.bag);
		notes.set(file, note);
		addPostings(postings, file, note.bag, owned);
	}
	return slicedState({...state.index, notes, postings}, state.pending);
}

export function stepSearchIndex(state, {notes: count = 64, own = false} = {}) {
	if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('notes must be a nonnegative safe integer');
	if (state.done || count === 0) return state;
	const notes = own ? state.index.notes : new Map(state.index.notes), postings = own ? state.index.postings : new Map(state.index.postings);
	const pending = own ? state.pending : new Map(state.pending), owned = own ? null : new Set();
	let walked = 0;
	for (const [file, text] of state.pending) {
		if (walked === count) break;
		const entry = state.index.sidecar.notes && state.index.sidecar.notes[file] || {};
		const proj = withPictures(projectText(text, entry, file), picturesOf(state.index, file)), bag = tokenBag(proj);
		notes.set(file, indexNote(proj, file, bag));
		addPostings(postings, file, bag, owned);
		pending.delete(file);
		walked++;
	}
	return slicedState({...state.index, notes, postings}, pending);
}

export function searchIndexProgress(state) {
	return {done: state.index.notes.size, total: state.index.notes.size + state.pending.size};
}

export const SEARCH_INDEX_CHARS = 8192;
export const SEARCH_WORKER_CHARS = 16384, SEARCH_WORKER_WORDS = 4096, SEARCH_WORKER_LINKS = 1024;
const SEARCH_INDEX_ROWS = 128;
function* searchStringRows(kind, value) {
	const text = String(value || '');
	if (!text.length) { yield [kind, '', true]; return; }
	for (let at = 0; at < text.length; at += SEARCH_INDEX_CHARS) yield [kind, text.slice(at, at + SEARCH_INDEX_CHARS), at + SEARCH_INDEX_CHARS >= text.length];
}
function* searchValueRows(value) {
	if (typeof value === 'string') { yield* searchStringRows('valueString', value); return; }
	if (value && typeof value === 'object') {
		yield [Array.isArray(value) ? 'array' : 'object'];
		if (Array.isArray(value)) { for (const part of value) yield* searchValueRows(part); }
		else for (const key of Object.keys(value)) { yield ['key', key]; yield* searchValueRows(value[key]); }
		yield ['end']; return;
	}
	yield ['value', value];
}
function* searchResultRows(proj, bag, links, title, encoded) {
	yield ['facts', proj.tasks.open, proj.tasks.done, proj.hasPicture, proj.hasDrawing, proj.hasLink, !!proj.hasRecording, !!proj.hasFile];
	yield* searchStringRows('cardTitle', title);
	yield* searchStringRows('title', proj.title);
	for (const head of proj.headings) { yield ['heading', head.level, head.start]; yield* searchStringRows('slug', head.slug); yield* searchStringRows('headingText', head.text); }
	for (const tag of proj.tags) yield* searchStringRows('tag', tag);
	if (proj.pictures) yield* searchStringRows('pictures', proj.pictures);
	yield* searchStringRows('excerpt', boundedExcerpt(proj.body));
	for (const field of fieldsOf(bag)) for (const [word, count] of bag[field]) { yield ['word', field, count]; yield* searchStringRows('token', word); }
	if (links) yield* searchValueRows(links);
	if (encoded !== null) yield* searchStringRows('encoded', encoded);
}

export function installSearchWorker(scope) {
	const parser = applyMarkdownSpec(scope.markdownit(RAPIER_MARKDOWN_SPEC.options), scope);
	installMarkdownMath(parser, RAPIER_MARKDOWN_SPEC.rules.mathBlock); installMarkdownImages(parser);
	configureParser(parser, splitOpeningFrontmatter);
	let job = null, serial = 0;
	const send = (operation, value = {}) => scope.postMessage({id: job.id, operation, ...value});
	const pause = () => new Promise(resolve => setTimeout(resolve, 0));
	const finish = async own => {
		try {
			let text;
			if (own.bytes.length) {
				const bytes = new Uint8Array(own.byteLength); let at = 0;
				for (const part of own.bytes) { bytes.set(part, at); at += part.length; }
				const decode = view => { try { return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(view); } catch (_) { throw Object.assign(new Error('this file is not UTF-8 text'), {name: 'EncodingError', code: 'unreadable'}); } };
				own.bytes = null; text = projectSearchBytes(bytes, {file: own.file, decode});
			} else { const source = own.source.join(''); text = own.ranges.length ? {searchText: source, payloadRanges: own.ranges, mapLink: searchByteLinkMap(own.ranges)} : source; }
			own.source = null;
			send('phase', {phase: 'projection'});
			const proj = withPictures(projectText(text, {}, own.file), own.pictures.join('')); own.pictures = null; own.ranges = null;
			const source = typeof text === 'string' ? text : text.searchText;
			const sourceBytes = own.byteLength || new TextEncoder().encode(source).length + (text?.payloadRanges || []).reduce((total, row) => total + row.end - row.start - row.length, 0);
			const links = isCodeFile(own.file) ? null : projectLinks(source, {mapLink: text?.mapLink});
			const title = projectCard(own.file, source).title || '';
			const tokens = tokenBagWalk(proj); let part;
			send('phase', {phase: 'words'});
			do {
				const start = performance.now();
				do { part = tokens.next(); } while (!part.done && performance.now() - start < 4);
				if (!part.done) await pause();
				if (job !== own) return;
			} while (!part.done);
			const encoded = links ? JSON.stringify([packSearchProjection({...proj, bag: part.value, excerpt: boundedExcerpt(proj.body)}), packLinkProjection(links, sourceBytes)]) : null;
			own.result = searchResultRows(proj, part.value, links, title, encoded); own.carry = null;
			send('ready');
		} catch (error) { if (job === own) send('error', {message: String(error?.message || error).slice(0, 1024), ...(error?.code === 'unreadable' ? {code: 'unreadable'} : {})}); }
	};
	scope.addEventListener('message', ({data}) => {
		try {
			if (data?.operation === 'begin') {
				if (!Number.isSafeInteger(data.id) || data.id <= serial || typeof data.file !== 'string') return;
				serial = data.id; job = {id: data.id, file: data.file, source: [], bytes: [], byteLength: 0, pictures: [], ranges: []}; send('input'); return;
			}
			if (!job || data?.id !== job.id) return;
			if (data.operation === 'end') { job = null; return; }
			if (data.operation === 'source' || data.operation === 'pictures') {
				if (typeof data.text !== 'string' || data.text.length > SEARCH_INDEX_CHARS) throw new Error('Invalid search input packet');
				job[data.operation].push(data.text); send('input');
			} else if (data.operation === 'bytes') {
				if (!(data.bytes instanceof Uint8Array) || data.bytes.length > SEARCH_INDEX_CHARS) throw new Error('Invalid search byte packet');
				job.bytes.push(data.bytes); job.byteLength += data.bytes.length; send('input');
			} else if (data.operation === 'ranges') {
				if (!Array.isArray(data.rows) || data.rows.length > 32) throw new Error('Invalid search source ranges');
				for (const row of data.rows) job.ranges.push(row); send('input');
			} else if (data.operation === 'finish') void finish(job);
			else if (data.operation === 'pull' && job.result) {
				const rows = []; let chars = 0, done = false;
				while (rows.length < SEARCH_INDEX_ROWS && chars < SEARCH_INDEX_CHARS) {
					const next = job.carry || job.result.next(); job.carry = null;
					if (next.done) { done = true; break; }
					const size = typeof next.value[1] === 'string' ? next.value[1].length : 0;
					if (rows.length && chars + size > SEARCH_INDEX_CHARS) { job.carry = next; break; }
					rows.push(next.value); chars += size;
				}
				send('result', {rows, done});
			}
		} catch (error) { if (job) send('error', {message: String(error?.message || error).slice(0, 1024)}); }
	});
}

export function createSearchIndexRunner({getState, setState, getLinks, setLinks, createWorker, wake, live = () => true, completed = () => {}, unreadable = () => {}, streaming = () => false}) {
	let active = null, worker = null, sequence = 0, stopped = false, resolving = false, resolution = null, resolutionOf = null;
	const retired = [], failed = new Map(), linkDirty = new Set(), linkRemovals = new Set();
	const refresh = () => {
		const state = getState(), next = slicedState(state.index, state.pending);
		if (next.index.partial && failed.size === state.pending.size) next.index.progress.unread = true;
		setState(next);
	};
	function* oldWords(file, bag) { for (const field of fieldsOf(bag)) for (const word of bag[field].keys()) yield [file, word]; }
	const retire = (file, note) => { if (note?.bag) retired.push({file, walk: oldWords(file, note.bag)}); };
	const dispose = () => { if (worker) { worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate(); worker = null; } };
	const valid = own => !stopped && live() && active === own && getState().pending.get(own.file) === own.text && (picturesOf(getState().index, own.file) || '') === own.pictures;
	const reject = (own, error) => {
		if (!valid(own)) return;
		retire(own.file, own.note); active = null;
		if (error?.code === 'unreadable') {
			try { worker?.postMessage({id: own.id, operation: 'end'}); } catch (_) {}
			const state = getState(); state.pending.delete(own.file); failed.delete(own.file); linkDirty.delete(own.file);
			refresh(); unreadable(own.file); wake(); return;
		}
		dispose(); failed.set(own.file, own.text);
		refresh(); wake();
	};
	const accept = (own, rows) => {
		const note = own.note, index = getState().index;
		const addValue = value => {
			const top = own.values.at(-1);
			if (!top) own.links = value;
			else if (Array.isArray(top.value)) top.value.push(value);
			else { top.value[top.key] = value; top.key = null; }
		};
		for (const row of rows) {
			const [kind, value, end] = row;
			if (kind === 'facts') { note.tasks = {open: row[1], done: row[2]}; note.hasPicture = row[3]; note.hasDrawing = row[4]; note.hasLink = row[5]; if (row[6]) note.hasRecording = true; if (row[7]) note.hasFile = true; }
			else if (kind === 'heading') { own.heading = {level: value, start: end, slug: '', text: ''}; note.headings.push(own.heading); }
			else if (kind === 'slug' || kind === 'headingText') own.heading[kind === 'slug' ? 'slug' : 'text'] += value;
			else if (kind === 'tag') { own.tag += value; if (end) { note.tags.push(own.tag); own.tag = ''; } }
			else if (kind === 'word') { own.field = value; own.count = end; own.token = ''; note.bag[value] ||= new Map(); }
			else if (kind === 'token') {
				own.token += value;
				if (end) {
					const word = own.token; note.bag[own.field].set(word, own.count);
					let inner = index.postings.get(word); if (!inner) { inner = new Map(); index.postings.set(word, inner); }
					let record = inner.get(own.file); if (!record) { record = {title: 0, headings: 0, tags: 0, body: 0}; inner.set(own.file, record); }
					record[own.field] = own.count; own.token = '';
				}
			} else if (kind === 'cardTitle') own.cardTitle += value;
			else if (kind === 'encoded') own.encoded += value;
			else if (kind === 'array' || kind === 'object') { const part = kind === 'array' ? [] : {}; addValue(part); own.values.push({value: part}); }
			else if (kind === 'key') own.values.at(-1).key = value;
			else if (kind === 'end') own.values.pop();
			else if (kind === 'value') addValue(value);
			else if (kind === 'valueString') { own.valueText += value; if (end) { addValue(own.valueText); own.valueText = ''; } }
			else if (kind === 'title' || kind === 'excerpt' || kind === 'pictures') note[kind] = (note[kind] || '') + value;
			else throw new Error('Invalid search result packet');
		}
	};
	const start = (file, text) => {
		const own = active = {id: ++sequence, file, text, pictures: picturesOf(getState().index, file) || '', at: 0, field: text?.searchBytes ? 'bytes' : 'source', input: false, ready: false, packet: null,
			note: {file, title: '', headings: [], tags: [], excerpt: '', bag: {title: new Map(), headings: new Map(), tags: new Map(), body: new Map()}}, tag: '', cardTitle: '', encoded: '', values: [], valueText: ''};
		try {
			if (!worker) {
				const made = worker = createWorker();
				made.onmessage = ({data}) => {
					const job = active;
					if (!job || !valid(job) || data?.id !== job.id) return;
					if (data.operation === 'error') { reject(job, Object.assign(new Error(data.message), data.code === 'unreadable' ? {code: 'unreadable'} : {})); return; }
					if (data.operation === 'input') job.input = true;
					else if (data.operation === 'ready') job.ready = true;
					else if (data.operation === 'result') job.packet = data;
					wake();
				};
				made.onerror = event => { event.preventDefault?.(); const job = active; if (worker === made) dispose(); if (job) reject(job, event.error || new Error(event.message || 'Search worker stopped')); };
				made.onmessageerror = () => { const job = active; if (worker === made) dispose(); if (job) reject(job, new Error('Search worker result could not be read')); };
			}
			own.worker = worker;
			worker.postMessage({id: own.id, operation: 'begin', file});
		} catch (error) { reject(own, error); }
	};
	const small = (file, text, state) => {
		const source = typeof text === 'string' ? text : text.searchText;
		return !text?.searchBytes && source.length + (picturesOf(state.index, file) || '').length <= SEARCH_WORKER_CHARS && (!text.payloadRanges || text.payloadRanges.length <= 32);
	};
	const step = () => {
		if (stopped || !live()) return false;
		const state = getState();
		if (retired.length) {
			for (let count = 0; count < SEARCH_INDEX_ROWS && retired.length; count++) {
				const next = retired[0].walk.next(); if (next.done) { retired.shift(); continue; }
				const [file, word] = next.value, inner = state.index.postings.get(word);
				if (inner) { inner.delete(file); if (!inner.size) state.index.postings.delete(word); }
			}
			return true;
		}
		if (linkRemovals.size && getLinks?.()) {
			const file = linkRemovals.values().next().value, stream = streaming();
			const done = stageLinkNote(getLinks(), {file, projection: null, stream}).next().value;
			setLinks(done.index); linkRemovals.delete(file);
			if (!stream) { resolving = true; resolution = null; }
			return true;
		}
		if (!active) {
			let next; for (const row of state.pending) if (failed.get(row[0]) !== row[1]) { next = row; break; }
			if (!next) {
				if (!resolving || !getLinks?.()) return false;
				if (!resolution || resolutionOf !== getLinks()) { resolutionOf = getLinks(); resolution = stageLinkIndex(resolutionOf); }
				try { const part = resolution.next(); if (part.done) { setLinks(part.value); resolving = false; resolution = null; } }
				catch (error) { if (error.message !== 'link_index_changed') throw error; resolution = null; }
				return true;
			}
			const [file, text] = next, source = typeof text === 'string' ? text : text.searchText;
			const pictures = picturesOf(state.index, file) || '';
			if (small(file, text, state)) {
				try {
					const proj = withPictures(projectText(text, state.index.sidecar.notes?.[file] || {}, file), pictures), bag = tokenBag(proj);
					if (linkDirty.has(file) && getLinks?.() && !isCodeFile(file)) {
						active = {file, text, pictures, note: indexNote(proj, file, bag), links: projectLinks(source, {mapLink: text?.mapLink}), done: true, cardTitle: projectCard(file, source).title || ''};
						addPostings(state.index.postings, file, bag); return true;
					}
					state.index.notes.set(file, indexNote(proj, file, bag)); addPostings(state.index.postings, file, bag);
					state.pending.delete(file); failed.delete(file); linkDirty.delete(file); refresh(); completed(file);
				} catch (_) { failed.set(file, text); refresh(); }
				return true;
			}
			start(file, text); return false;
		}
		const own = active;
		if (!valid(own)) { if (!own.done) dispose(); retire(own.file, own.note); active = null; return true; }
		if (own.done) {
			if (getLinks?.() && own.links) {
				if (!own.stage || own.stageOf !== getLinks()) { own.stageOf = getLinks(); own.streamed = streaming(); own.stage = stageLinkNote(own.stageOf, {file: own.file, projection: own.links, stream: own.streamed}); }
				try {
					const part = own.stage.next(); if (!part.done) return true;
					setLinks(part.value.index);
					if (part.value.changedNames && !own.streamed) { resolving = true; resolution = null; }
				} catch (error) { if (error.message !== 'link_index_changed') { reject(own, error); return true; } own.stage = null; return true; }
			}
			state.index.notes.set(own.file, {...own.note, ...searchEntry(state.index.sidecar.notes?.[own.file])});
			state.pending.delete(own.file); failed.delete(own.file); linkDirty.delete(own.file); active = null; refresh(); completed(own.file, {title: own.cardTitle, ...(own.encoded ? {encoded: own.encoded} : {})}); return true;
		}
		if (own.packet) {
			const packet = own.packet; own.packet = null;
			try {
				if (!Array.isArray(packet.rows) || packet.rows.length > SEARCH_INDEX_ROWS) throw new Error('Invalid search result batch');
				accept(own, packet.rows);
				if (packet.done) {
					worker?.postMessage({id: own.id, operation: 'end'}); own.worker = null; own.done = true; return true;
				}
				own.ready = true;
			} catch (error) { reject(own, error); return true; }
		}
		if (own.ready) { own.ready = false; own.worker.postMessage({id: own.id, operation: 'pull'}); return false; }
		if (own.input) {
			own.input = false;
			for (;;) {
				if (own.field === 'bytes') {
					const bytes = own.text.searchBytes;
					if (own.at < bytes.length) { const part = bytes.slice(own.at, own.at + SEARCH_INDEX_CHARS); own.at += part.length; own.worker.postMessage({id: own.id, operation: 'bytes', bytes: part}, [part.buffer]); break; }
					own.field = 'pictures'; own.at = 0;
				}
				const source = own.field === 'source' ? (typeof own.text === 'string' ? own.text : own.text.searchText) : own.pictures;
				if (own.field !== 'ranges' && own.at < source.length) {
					const text = source.slice(own.at, own.at + SEARCH_INDEX_CHARS); own.at += text.length;
					own.worker.postMessage({id: own.id, operation: own.field, text}); break;
				}
				if (own.field === 'source') { own.field = 'pictures'; own.at = 0; continue; }
				if (own.field === 'pictures') { own.field = 'ranges'; own.at = 0; }
				const ranges = own.text?.payloadRanges || [];
				if (own.at < ranges.length) { const rows = ranges.slice(own.at, own.at + 32); own.at += rows.length; own.worker.postMessage({id: own.id, operation: 'ranges', rows}); break; }
				own.worker.postMessage({id: own.id, operation: 'finish'}); break;
			}
		}
		return false;
	};
	return {
		step,
		queue(file, text, entry) {
			const state = getState();
			if (active?.file === file) { if (!active.done) dispose(); retire(file, active.note); active = null; }
			retire(file, state.index.notes.get(file)); state.index.notes.delete(file); failed.delete(file);
			if (text == null) { state.pending.delete(file); linkDirty.delete(file); linkRemovals.add(file); }
			else { state.pending.set(file, text); linkDirty.add(file); linkRemovals.delete(file); }
			state.index = {...state.index, sidecar: updatedSidecar(state.index.sidecar, file, text, entry, true)};
			refresh(); wake();
		},
		cancel() { if (stopped) return; stopped = true; dispose(); active = null; retired.length = 0; failed.clear(); linkDirty.clear(); linkRemovals.clear(); resolution = null; resolving = false; },
		resolve() { resolving = true; resolution = null; wake(); },
		owns(file) { return active?.file === file || linkDirty.has(file) || linkRemovals.has(file) || retired.some(row => row.file === file); },
		get linksPending() { return resolving || linkRemovals.size > 0 || !!active?.done; },
		get waiting() { return !!active && !active.done && !active.input && !active.ready && !active.packet; },
		get cheap() {
			if (stopped || !live() || active) return false;
			if (retired.length || (linkRemovals.size && getLinks?.())) return 'short';
			const state = getState();
			for (const [file, text] of state.pending) if (failed.get(file) !== text) return small(file, text, state) ? 'note' : false;
			return resolving && !!getLinks?.() ? 'short' : false;
		},
	};
}

function updatedSidecar(previous, file, text, entry, own = false) {
	if (own && previous.notes && text != null && (entry === undefined || entry && entry === previous.notes[file])) return previous;
	const entries = {...previous.notes};
	if (text == null) delete entries[file];
	else if (entry !== undefined) entries[file] = entry || {};
	return {...previous, notes: entries};
}

function updateSlicedSearchIndex(state, file, text, entry, queue = false, own = false) {
	if (state.index.notes.has(file) || (state.done && !queue)) {
		const {notes, postings, sections, sidecar, pictures} = state.index;
		return slicedState(updateSearchIndex({notes, postings, sections, sidecar, ...(pictures ? {pictures} : {})}, file, text, entry, {own}), state.pending);
	}
	const pending = own ? state.pending : new Map(state.pending);
	if (text == null) pending.delete(file); else pending.set(file, text);
	const sidecar = updatedSidecar(state.index.sidecar, file, text, entry, own);
	return slicedState({...state.index, sidecar}, pending);
}

export function updateSearchIndex(sidx, file, text, entry, {queue = false, own = false} = {}) {
	if (sidx.pending instanceof Map) return updateSlicedSearchIndex(sidx, file, text, entry, queue, own);
	if (sidx.partial) throw new TypeError('Update the resumable state, not its partial index');
	const previous = sidx.sidecar || {}, nextEntry = entry === undefined ? previous.notes?.[file] : entry;
	const proj = text == null ? null : withPictures(projectText(text, nextEntry || {}, file), picturesOf(sidx, file)), bag = proj && tokenBag(proj);
	const notes = own ? sidx.notes : new Map(sidx.notes), postings = own ? sidx.postings : new Map(sidx.postings);
	const old = notes.get(file), owned = own ? null : new Set();
	const sidecar = updatedSidecar(previous, file, text, entry, own);
	removeFilePostings(postings, file, old && old.bag, owned);
	if (text == null) notes.delete(file);
	else {
		notes.set(file, indexNote(proj, file, bag));
		addPostings(postings, file, bag, owned);
	}
	return {notes, postings, sections: sidx.sections, sidecar, ...(sidx.pictures ? {pictures: sidx.pictures} : {})};
}

export function updateSearchPictures(sidx, file, words, {own = false} = {}) {
	if (sidx.pending instanceof Map) {
		if (!sidx.index.notes.has(file)) return sidx;
		return slicedState(updateSearchPictures(sidx.index, file, words, {own}), sidx.pending);
	}
	const old = sidx.notes.get(file);
	if (!old) return sidx;
	const next = typeof words === 'string' && words.trim() ? words : '';
	if ((old.pictures || '') === next) return sidx;
	const notes = own ? sidx.notes : new Map(sidx.notes), postings = own ? sidx.postings : new Map(sidx.postings), owned = own ? null : new Set();
	const bag = {...old.bag}; delete bag.pictures;
	if (next) { const words_ = counted([next]); if (words_.size) bag.pictures = words_; }
	for (const tok of new Set([...(old.bag.pictures?.keys() || []), ...(bag.pictures?.keys() || [])])) {
		const count = bag.pictures?.get(tok) || 0, inner = postings.get(tok), rec = inner?.get(file);
		if ((rec?.pictures || 0) === count) continue;
		const nextInner = inner ? (owned && !owned.has(tok) ? new Map(inner) : inner) : new Map();
		if (owned) owned.add(tok);
		const nextRec = {...(rec || {title: 0, headings: 0, tags: 0, body: 0})};
		if (count) nextRec.pictures = count; else delete nextRec.pictures;
		if (nextRec.title || nextRec.headings || nextRec.tags || nextRec.body || nextRec.pictures) nextInner.set(file, nextRec); else nextInner.delete(file);
		if (nextInner.size) postings.set(tok, nextInner); else postings.delete(tok);
	}
	const record = {...old, bag};
	if (bag.pictures) record.pictures = copyText(next); else delete record.pictures;
	notes.set(file, record);
	return {...sidx, notes, postings};
}

function readQuoted(s, i) {
	let j = i + 1;
	while (j < s.length && s[j] !== '"') j++;
	return {value: s.slice(i + 1, j), next: j < s.length ? j + 1 : j};
}

export function parseQuery(q) {
	const s = String(q ?? '');
	const words = [], phrases = [], negations = [], excludedFilters = [];
	const filters = {tag: [], in: [], is: [], has: [], colour: [], before: null, after: null};
	let i = 0;
	while (i < s.length) {
		while (s[i] === ' ' || s[i] === '\t') i++;
		if (i >= s.length) break;
		let neg = false;
		if (s[i] === '-' && s[i + 1] && s[i + 1] !== ' ') { neg = true; i++; }
		if (s[i] === '"') {
			const qv = readQuoted(s, i);
			if (neg) negations.push(fold(qv.value)); else phrases.push(qv.value);
			i = qv.next;
			continue;
		}
		const rest = s.slice(i);
		const seen = /^pictures:(on|off)(?=[ \t]|$)/i.exec(rest);
		if (seen) {
			filters.pictures = (seen[1].toLowerCase() === 'on') !== neg ? 'on' : 'off';
			i += seen[0].length;
			continue;
		}
		const filt = /^(tag|in|is|has|colour|color|before|after):/i.exec(rest);
		if (filt && (!neg || !/^(?:before|after)$/i.test(filt[1]))) {
			const key = filt[1].toLowerCase() === 'color' ? 'colour' : filt[1].toLowerCase();
			i += filt[0].length;
			let val = '';
			if (s[i] === '"') { const qv = readQuoted(s, i); val = qv.value; i = qv.next; }
			else { let j = i; while (j < s.length && s[j] !== ' ' && s[j] !== '\t') j++; val = s.slice(i, j); i = j; }
			if (key === 'tag') val = val.replace(/^#/, '');
			else if (key === 'is' || key === 'has' || key === 'colour') val = val.toLowerCase();
			if (neg) excludedFilters.push([key, val]);
			else if (key === 'before' || key === 'after') filters[key] = val;
			else filters[key].push(val);
			continue;
		}
		let j = i; while (j < s.length && s[j] !== ' ' && s[j] !== '\t') j++;
		const tok = s.slice(i, j);
		if (tok) { if (neg) negations.push(fold(tok)); else for (const word of wordsOf(tok)) words.push(word); }
		i = j;
	}
	return {words, phrases, filters, negations, excludedFilters};
}

function parseDay(s) {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
	if (!m) return null;
	const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]), date = new Date(0);
	date.setFullYear(year, month - 1, day); date.setHours(0, 0, 0, 0);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date.getTime() : null;
}

function inSection(proj, file, sidx, want) {
	const entry = (sidx.sidecar && sidx.sidecar.notes && sidx.sidecar.notes[file]) || {
		trashed: proj.trashed, archived: proj.archived, pinned: proj.pinned, category: proj.category, skill: false,
	};
	const sec = sectionOf(entry, sidx.sections);
	const w = want.toLowerCase();
	if (sec.toLowerCase() === w) return true;
	if (w === 'other' && sec === 'others') return true;
	if ((w === 'archived' || w === 'archive') && sec === 'archive') return true;
	if ((w === 'deleted' || w === 'trash') && sec === 'trash') return true;
	if (typeof proj.category === 'string' && proj.category.toLowerCase() === w) return true;
	return false;
}

function fieldHasPrefix(bag, prefix, pictures = true) {
	for (const field of fieldsOf(bag, pictures)) {
		for (const tok of bag[field].keys()) if (tok.startsWith(prefix)) return field;
	}
	return '';
}

function fieldHasWord(bag, word, pictures = true) {
	for (const field of fieldsOf(bag, pictures)) {
		if (bag[field].has(word)) return field;
	}
	return '';
}

function bodyLiteral(proj, p, bodyReady) {
	if (bodyReady) return fold(proj.body).includes(p);
	if (!p) return true;
	if (/[σς]/.test(p)) return null;
	for (const tok of proj.bag.body.keys()) if (tok.includes(p)) return true;
	for (const run of p.match(/[a-z]+/g) || []) {
		let present = false;
		for (const tok of proj.bag.body.keys()) if (tok.includes(run)) { present = true; break; }
		if (!present) return false;
	}
	return null;
}

function phraseIn(proj, phrase, bodyReady, pictures = true) {
	const p = fold(phrase);
	if (!p) return true;
	if (fold(proj.title).includes(p)) return 'title';
	if (fold(proj.headings.map(h => h.text).join(' ')).includes(p)) return 'headings';
	if (proj.tags.some(t => fold(t).includes(p))) return 'tags';
	const body = bodyLiteral(proj, p, bodyReady);
	if (body) return 'body';
	if (pictures && proj.pictures && fold(proj.pictures.replace(/\s+/g, ' ')).includes(p)) return 'pictures';
	return body === null ? null : '';
}

const FILTER_FIELDS = ['is', 'has', 'colour', 'tag', 'in'];
function matchesFilter(proj, file, sidx, key, value) {
	switch (key) {
		case 'is':
			switch (value) {
				case 'todo': return proj.tasks.open > 0;
				case 'done': return proj.tasks.done > 0 && proj.tasks.open === 0;
				case 'pinned': return proj.pinned;
				case 'archived': return proj.archived;
				case 'trash': case 'trashed': return proj.trashed;
				default: return false;
			}
		case 'has':
			switch (value) {
				case 'picture': return proj.hasPicture;
				case 'drawing': return proj.hasDrawing;
				case 'recording': return !!proj.hasRecording;
				case 'file': return !!proj.hasFile;
				case 'remind': return !!proj.remind;
				case 'link': return proj.hasLink;
				case 'tags': return proj.tags.length > 0;
				case 'list': return proj.tasks.open + proj.tasks.done > 0;
				default: return false;
			}
		case 'colour': { const want = fold(value); return want === 'none' ? !proj.colour : fold(proj.colour) === want; }
		case 'tag': return proj.tags.some(t => fold(t) === fold(value) || fold(t).startsWith(fold(value) + '/'));
		case 'in': return inSection(proj, file, sidx, value);
		default: return false;
	}
}
function passesFilters(proj, file, sidx, f, excluded) {
	if (proj.trashed && !f.is.some(x => x === 'trash' || x === 'trashed')) return false;
	if (proj.archived && !f.is.includes('archived')) return false;
	for (const key of FILTER_FIELDS) for (const value of f[key]) if (!matchesFilter(proj, file, sidx, key, value)) return false;
	for (const [key, value] of excluded) if (matchesFilter(proj, file, sidx, key, value)) return false;
	const when = proj.modified != null ? proj.modified : proj.created;
	if (f.before) {
		const t = parseDay(f.before);
		if (t == null || when == null || when >= t) return false;
	}
	if (f.after) {
		const t = parseDay(f.after);
		if (t == null || when == null || when < t) return false;
	}
	return true;
}

function snippetWindow(field, index, length) {
	let from = Math.max(0, index - 40), to = Math.min(field.length, index + length + 60);
	if (from > 0) {
		const gap = field.slice(from, index).search(/\s/);
		from = gap >= 0 ? from + gap + 1 : graphemes(field).containing(from).index;
	}
	if (to < field.length) {
		const tail = field.slice(index + length, to); let cut = -1;
		for (let i = tail.length - 1; i >= 0; i--) if (/\s/.test(tail[i])) { cut = i; break; }
		to = cut >= 0 ? index + length + cut : graphemes(field).containing(to).index;
	}
	return [from, to];
}
function foldedRange(field, needle) {
	const wanted = fold(needle);
	if (!wanted) return null;
	const at = fold(field).indexOf(wanted);
	if (at < 0) return null;
	const end = at + wanted.length;
	let folded = 0, from = -1;
	for (const {segment, index} of graphemes(field)) {
		folded += fold(segment).length;
		if (from < 0 && folded > at) from = index;
		if (folded >= end) return {from, to: index + segment.length};
	}
	return null;
}
export function snippetFor(note, query, text) {
	if (typeof text !== 'string') throw new TypeError('Snippet needs exact text for ' + note.file);
	const q = searchQuery(query);
	const needles = [...q.phrases, ...q.words];
	const proj = projectText(text, {}, note.file, true);
	const fields = [proj.title, proj.headings.map(h => h.text).join(' · '), proj.body.replaceAll(ASSET_TOKEN, ' ').replace(/\r\n?/g, '\n')].filter(Boolean);
	for (const needle of needles) for (const field of fields) {
		const hit = foldedRange(field, needle);
		if (!hit) continue;
		const [from0, to0] = snippetWindow(field, hit.from, hit.to - hit.from), prefix = from0 > 0 ? 1 : 0;
		return {text: copyText((prefix ? '…' : '') + field.slice(from0, to0) + (to0 < field.length ? '…' : '')),
			from: prefix + hit.from - from0, to: prefix + hit.to - from0};
	}
	if (note.pictures && q.filters.pictures !== 'off') {
		const field = note.pictures.replace(/\s+/g, ' ');
		for (const needle of needles) {
			const hit = foldedRange(field, needle);
			if (!hit) continue;
			const [from0, to0] = snippetWindow(field, hit.from, hit.to - hit.from), prefix = from0 > 0 ? 1 : 0;
			return {text: copyText((prefix ? '…' : '') + field.slice(from0, to0) + (to0 < field.length ? '…' : '')),
				from: prefix + hit.from - from0, to: prefix + hit.to - from0, picture: true};
		}
	}
	const snippet = copyText(proj.title || proj.body.slice(0, SEARCH_EXCERPT_CHARS));
	return {text: snippet, from: 0, to: 0};
}

function rankNote(proj, file, sidx, q, bodyReady, words) {
	const f = q.filters, pictures = f.pictures !== 'off';
	if (!passesFilters(proj, file, sidx, f, q.excludedFilters)) return null;
	let pending = false;
	for (const n of q.negations) {
		const field = phraseIn(proj, n, bodyReady, pictures);
		if (field === null) pending = true;
		else if (field) return null;
	}
	const matched = [];
	let score = 0;
	const add = (field, weight) => { if (!matched.includes(field)) matched.push(field); score += (WEIGHT[field] || 1) * weight; };
	for (const ph of q.phrases) {
		const field = phraseIn(proj, ph, bodyReady, pictures);
		if (field === '') return null;
		if (field === null) pending = true;
		else add(field, 4);
	}
	const last = words.at(-1);
	for (let i = 0; i < words.length - 1; i++) {
		const field = fieldHasWord(proj.bag, words[i], pictures);
		if (!field) return null;
		add(field, 1);
	}
	if (last !== undefined) {
		const exact = fieldHasWord(proj.bag, last, pictures);
		const field = exact || fieldHasPrefix(proj.bag, last, pictures);
		if (!field) return null;
		add(field, exact ? 1 : 0.5);
	}
	if (!q.words.length && !q.phrases.length) score = 1;
	const modified = proj.modified != null ? proj.modified : (proj.created != null ? proj.created : 0);
	return {pending, row: {file, score, matched, _mod: modified}};
}

const compareRank = (a, b) => b.score - a.score || b._mod - a._mod || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
function rankedAnswer(rows, pending, query, limit, sections, coverage) {
	rows.sort(compareRank);
	const answer = {results: rows.slice(0, limit).map(({file, score, matched}) => ({file, score, matched: [...matched]})),
		confirm: pending.map(p => p.file)};
	if (coverage.partial) { answer.partial = true; answer.progress = {...coverage.progress}; }
	if (pending.length) answer.continuation = {query, limit, rows, pending, sections};
	return answer;
}

function searchQuery(query) {
	const parsed = typeof query === 'string' ? parseQuery(query) : query;
	return {words: typeof query === 'string' ? [...parsed.words] : (parsed.words || []).flatMap(wordsOf), phrases: [...(parsed.phrases || [])], negations: [...(parsed.negations || [])],
		excludedFilters: structuredClone(parsed.excludedFilters || []),
		filters: {tag: [], in: [], is: [], has: [], colour: [], before: null, after: null, ...structuredClone(parsed.filters || {})}};
}
export function search(sidx, query, {limit = 50, now, candidateOrder = false} = {}) {
	void now;
	const q = searchQuery(query);
	if (limit === 0) return rankedAnswer([], [], q, limit, [], sidx);
	const wordList = q.words.map(fold);
	const last = wordList.at(-1);
	const intersect = (a, b) => {
		if (!a) return b;
		const out = new Set();
		const [small, big] = a.size < b.size ? [a, b] : [b, a];
		for (const x of small) if (big.has(x)) out.add(x);
		return out;
	};
	const consider = (tok, prefix) => {
		const files = new Set();
		if (!prefix) {
			const inner = sidx.postings.get(tok);
			if (inner) for (const file of inner.keys()) files.add(file);
			return files;
		}
		for (const [t, inner] of sidx.postings) {
			if (t.startsWith(tok)) for (const file of inner.keys()) files.add(file);
		}
		return files;
	};
	let candidates = null;
	for (const w of wordList.slice(0, -1)) candidates = intersect(candidates, consider(w, false));
	if (last !== undefined) candidates = intersect(candidates, consider(last, true));
	const rows = [], pending = [], ordered = candidateOrder ? [] : null;
	for (const file of (candidates || sidx.notes).keys()) {
		const note = sidx.notes.get(file);
		if (!note) continue;
		const entry = sidx.sidecar?.notes?.[file], proj = entry ? {...note, ...searchEntry(entry)} : note;
		const ranked = rankNote(proj, file, sidx, q, false, wordList);
		if (!ranked) continue;
		if (ranked.pending) {
			if (ordered) ordered.push(ranked.row);
			pending.push({file, entry: structuredClone(sidx.sidecar?.notes?.[file] || {
				category: proj.category, pinned: proj.pinned, archived: proj.archived, trashed: proj.trashed,
				remind: proj.remind, colour: proj.colour, created: proj.created, modified: proj.modified,
			}), ...(proj.pictures ? {pictures: proj.pictures} : {})});
		} else rows.push(ranked.row);
	}
	const answer = rankedAnswer(rows, pending, q, limit, pending.length ? structuredClone(sidx.sections) : [], sidx);
	if (ordered) answer.candidates = (pending.length ? rows.concat(ordered).sort(compareRank) : rows).map(row => row.file);
	return answer;
}

export function confirmSearch(answer, texts) {
	if (!answer.confirm.length) return answer;
	const {query, limit, rows: known, pending, sections} = answer.continuation;
	const rows = known.slice(), remaining = [], words = query.words.map(fold);
	for (const item of pending) {
		const {file, entry} = item;
		if (!texts.has(file)) { remaining.push(item); continue; }
		const text = texts.get(file);
		if (typeof text !== 'string') throw new TypeError('Search confirmation needs exact text for ' + file);
		const proj = withPictures(projectText(text, entry, file), item.pictures);
		if (words.length) proj.bag = tokenBag(proj); else wordSegments('');
		const ranked = rankNote(proj, file, {sections, sidecar: {notes: {[file]: entry}}}, query, true, words);
		if (ranked) rows.push(ranked.row);
	}
	const confirmed = rankedAnswer(rows, remaining, query, limit, sections, answer);
	if (answer.candidates) confirmed.candidates = answer.candidates;
	return confirmed;
}

export function createSearchQuery(sidx, query, {id, files, visible = [], limit = 50} = {}) {
	if (typeof id !== 'string' || !id.trim() || !Array.isArray(files) || !Array.isArray(visible) || !Number.isSafeInteger(limit) || limit < 1) throw new TypeError('invalid search query run');
	const current = new Map();
	for (const file of files) {
		const read = libraryReadRow(file);
		if (current.has(read.key)) throw new TypeError('query scope repeats a file');
		current.set(read.key, {...read, entry: structuredClone(file.entry || {})});
	}
	const q = searchQuery(query), evidence = search(sidx, q, {limit: Infinity, candidateOrder: true});
	const candidates = new Set(evidence.candidates), onScreen = new Set(visible), pending = [], seen = new Set();
	for (const key of [...evidence.candidates, ...current.keys()]) {
		if (seen.has(key)) continue; seen.add(key);
		const file = current.get(key); if (!file) continue;
		const indexed = sidx.notes.has(key) && JSON.stringify(file.entry) === JSON.stringify(sidx.sidecar?.notes?.[key] || {});
		if (indexed && !candidates.has(key) && !onScreen.has(key)) continue;
		pending.push({file: key, entry: file.entry, revision: file.revision, bytes: file.bytes, priority: indexed && candidates.has(key)});
	}
	const answer = rankedAnswer([], pending, q, current.size, structuredClone(sidx.sections || []), {});
	const state = {id, limit, total: current.size, answer, results: [], failed: [], firstHit: false};
	state.notice = queryNotice(state, 'searching');
	return state;
}

function queryNotice(state, stage) {
	return {id: state.id, stage, done: state.total - state.answer.confirm.length, total: state.total,
		confirmed: state.answer.results.length, unread: state.failed.length};
}

export function searchQueryReads(state) {
	const failed = new Set(state.failed);
	return (state.answer.continuation?.pending || []).filter(row => !failed.has(row.file))
		.map(row => ({key: row.file, revision: row.revision, bytes: row.bytes, priority: row.priority}));
}

export function confirmSearchQuery(previous, {id, rows = [], texts = new Map(), complete = false} = {}) {
	if (id !== previous.id) return {state: previous, notices: []};
	if (!Array.isArray(rows) || !(texts instanceof Map) || typeof complete !== 'boolean') throw new TypeError('invalid search read receipt');
	const pending = new Map((previous.answer.continuation?.pending || []).map(row => [row.file, row]));
	const exact = new Map(), failed = new Set(previous.failed); let accepted = false;
	for (const row of rows) {
		const read = libraryReadRow(row), wanted = pending.get(read.key);
		if (!wanted || wanted.revision !== read.revision || wanted.bytes !== read.bytes || failed.has(read.key)) continue;
		accepted = true;
		if (!texts.has(read.key)) { failed.add(read.key); continue; }
		const text = texts.get(read.key);
		if (typeof text !== 'string') throw new TypeError('Search confirmation needs exact text for ' + read.key);
		exact.set(read.key, text);
	}
	if (!accepted && (!complete || previous.notice.stage === 'complete' || previous.notice.stage === 'incomplete')) return {state: previous, notices: []};
	const answer = confirmSearch(previous.answer, exact);
	if (complete) for (const key of answer.confirm) failed.add(key);
	const first = !previous.firstHit && answer.results.length > 0;
	const state = {...previous, answer, results: answer.results.slice(0, previous.limit), failed: [...failed], firstHit: previous.firstHit || first};
	const stage = !answer.confirm.length ? 'complete' : answer.confirm.every(key => failed.has(key)) ? 'incomplete' : 'searching';
	const notices = first ? [queryNotice(state, 'first-hit')] : [];
	if (!first || stage !== 'searching') notices.push(queryNotice(state, stage));
	state.notice = notices.at(-1);
	return {state, notices};
}

export const SWITCHER_LIMIT = 8;

function switcherQueryWords(query) {
	const words = [];
	for (const part of wordSegments(query)) {
		if (!part.isWordLike) continue;
		const word = fold(part.segment);
		if (word) words.push(word);
	}
	return words;
}

function coversTokens(tokens, words) {
	const used = new Uint8Array(tokens.length);
	for (let w = 0; w < words.length; w++) {
		const word = words[w], prefix = w === words.length - 1;
		let found = -1;
		for (let i = 0; i < tokens.length; i++) {
			if (used[i]) continue;
			const token = tokens[i];
			if (token === word || (prefix && token.startsWith(word))) { found = i; break; }
		}
		if (found < 0) return false;
		used[found] = 1;
	}
	return true;
}

function coversAscii(text, words) {
	const spans = [];
	let i = 0;
	while (i < text.length) {
		const code = text.charCodeAt(i);
		const wordChar = (code >= 48 && code <= 57) || (code >= 97 && code <= 122) || code === 39;
		if (!wordChar) { i++; continue; }
		const start = i;
		while (i < text.length) {
			const next = text.charCodeAt(i);
			if (!((next >= 48 && next <= 57) || (next >= 97 && next <= 122) || next === 39)) break;
			i++;
		}
		let end = i;
		while (end > start && text.charCodeAt(end - 1) === 39) end--;
		if (end > start) spans.push(text.slice(start, end));
	}
	return coversTokens(spans, words);
}

function coversText(text, words) {
	if (!text || !words.length) return false;
	const folded = fold(text);
	if (!/[^\x00-\x7f]/.test(folded)) return coversAscii(folded, words);
	const tokens = [];
	for (const part of wordSegments(text)) if (part.isWordLike) tokens.push(fold(part.segment));
	return coversTokens(tokens, words);
}

export function switcherCatalogue(index, documents = []) {
	const rows = [];
	const notes = index && index.notes;
	if (notes && typeof notes.entries === 'function') {
		for (const [id, note] of notes) {
			const entry = index.sidecar?.notes?.[id] || note;
			if (!note || entry.trashed === true) continue;
			rows.push({
				kind: 'note',
				id,
				title: typeof note.title === 'string' ? note.title : '',
				first: typeof note.excerpt === 'string' ? note.excerpt : '',
				modified: Number.isFinite(entry.modified) ? entry.modified : 0,
			});
		}
	}
	if (Array.isArray(documents)) for (const doc of documents) {
		if (!doc || typeof doc.id !== 'string' || !doc.id) continue;
		rows.push({
			kind: doc.kind === 'note' || doc.kind === 'document' ? doc.kind : 'document',
			id: doc.id,
			title: typeof doc.title === 'string' ? doc.title : '',
			first: typeof doc.first === 'string' ? doc.first : '',
			modified: Number.isFinite(doc.modified) ? doc.modified : 0,
			...(doc.current ? {current: true} : {}),
			...(doc.recent ? {recent: doc.recent} : {}),
		});
	}
	return rows;
}

export function rankSwitcher(catalogue, query) {
	if (!Array.isArray(catalogue)) return [];
	const raw = String(query ?? '');
	if (!raw.trim()) return [];
	const words = switcherQueryWords(raw);
	if (!words.length) return [];
	const hits = [];
	for (const row of catalogue) {
		if (!row) continue;
		const title = String(row.title || '');
		const titleHit = coversText(title, words);
		if (!titleHit && !coversText(title + '\n' + String(row.first || ''), words)) continue;
		hits.push({row, rank: titleHit ? 0 : 1, modified: Number.isFinite(row.modified) ? row.modified : 0, id: String(row.id)});
	}
	hits.sort((a, b) => a.rank - b.rank || b.modified - a.modified || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const out = [];
	for (let i = 0; i < hits.length && i < SWITCHER_LIMIT; i++) out.push(hits[i].row);
	return out;
}
