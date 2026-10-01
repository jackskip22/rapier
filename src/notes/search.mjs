import {parseFrontMatter, tagsOf} from './frontmatter.mjs';
// Word questions are complete (last word a prefix). The index holds field/count bags, never bodies. confirm names unresolved literals;
// confirmSearch reprojects exact Markdown and reranks before limiting; an absent read stays in confirm. Pure.
// Segment authored words first, fold afterwards. One word reader for notes and questions.
import {cardHead, sectionOf, isCodeFile} from './model.mjs';
import {recordingsOf} from './audio.mjs';
import {attachmentsOf} from './attachments.mjs';
import {scanLinks, linkMask, hasHtmlTag, headingAnchors, isLineStart, asMap} from './links.mjs';
import {documentAssets, IMAGE_LIMITS, markdownParser} from '../spec/md-assets.mjs';
import {libraryReadRow} from './library-reads.mjs';

const BYTE_PAYLOAD_STUB = 'A'.repeat(128);
const ascii = bytes => String.fromCharCode(...bytes);
// Mapping is transient input to the links owner, never source for an action. In particular its
// existing 96-character data destination stays exact, and every edit coordinate stays in UTF-16
// of the original note. This closure captures only bounded rows, not the source byte buffer.
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

// Only a real parser's unambiguous reference destination may omit bytes; unrecognised candidates are restored and reparsed. Derived input only.
export function projectSearchBytes(input, {file = '', parser, decode = bytes => new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes)} = {}) {
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
	// A code file's data URLs are authored text too. The read owner supplies its filename before
	// the Markdown-only byte shortcut; no source buffer is retained by the projected index.
	if (isCodeFile(file)) return {searchText: decode(bytes), textRanges: bytes.length ? [{start: 0, end: bytes.length}] : [],
		payloadRanges: [], mapLink: searchByteLinkMap([])};
	const candidates = [];
	// A byte upper bound is deliberately conservative for non-ASCII notes: shortening must never
	// admit a document that the parser's original source-character limit would have refused.
	if (bytes.length <= IMAGE_LIMITS.sourceChars) for (let colon = bytes.indexOf(58, 4); colon >= 0; colon = bytes.indexOf(58, colon + 1)) {
		const urlStart = colon - 4;
		if ((bytes[urlStart] | 32) !== 100 || (bytes[urlStart + 1] | 32) !== 97 || (bytes[urlStart + 2] | 32) !== 116 || (bytes[urlStart + 3] | 32) !== 97) continue;
		let start = colon + 1;
		while (start < Math.min(bytes.length, colon + 40) && bytes[start] !== 44 && bytes[start] < 128) start++;
		if (bytes[start] !== 44 || !/^data:image\/(?:jxl|png|jpeg|webp|svg\+xml);base64,$/i.test(ascii(bytes.subarray(urlStart, ++start)))) continue;
		// A destination is one line: bound by the line first (2.5 s of base64 walking on 5,000 notes). The parser is the oracle.
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
		// The existing search heading reader can treat a definition followed by a setext underline
		// as a literal heading, even where Markdown-it recognizes a reference. Those indexed words
		// remain source: parser admission alone is not permission to change a retained heading.
		const headingLines = headingAnchors(searchText).map(heading => ({start: heading.start,
			end: Math.min(...['\r', '\n'].map(eol => { const end = searchText.indexOf(eol, heading.start); return end < 0 ? searchText.length : end; }))}));
		const approved = payloadRanges.filter(row => blocks.some(block => block.payloadStart === row.at && block.payloadEnd === row.at + row.length) &&
			!headingLines.some(line => line.start <= row.at && row.at < line.end));
		if (approved.length === accepted.length) return {searchText, textRanges, payloadRanges, mapLink: searchByteLinkMap(payloadRanges)};
		accepted = approved;
	}
}

const WEIGHT = {title: 8, headings: 4, tags: 3, body: 1, pictures: 1}, FIELDS = ['title', 'headings', 'tags', 'body'];
// The words the text-in-pictures plug-in read in a note's pictures (notes/ocr.mjs): a fifth field, sparse. A note with none
// keeps its projection, its packed row and its postings exactly as they were; `pictures:off` in a question leaves it out.
const PICTURE_FIELDS = [...FIELDS, 'pictures'];
const fieldsOf = (bag, pictures = true) => pictures && bag.pictures ? PICTURE_FIELDS : FIELDS;
// The untitled result face already shows 80 UTF-16 code units; keeping more buys no word evidence.
export const SEARCH_EXCERPT_CHARS = 80;
// A short slice can keep a large backing string alive; join copies only the requested characters.
function copyText(s) { return s.split('').join(''); }
function boundedExcerpt(text) {
	const s = String(text ?? '');
	let end = Math.min(SEARCH_EXCERPT_CHARS, s.length);
	// A cut between a surrogate pair would keep a dangling lead. Shorten rather than split it.
	if (end > 0 && end < s.length) {
		const lead = s.charCodeAt(end - 1);
		if (lead >= 0xD800 && lead <= 0xDBFF) end--;
	}
	return copyText(s.slice(0, end));
}
function indexNote(proj, file, bag) {
	const {body, excerpt, ...fields} = proj;
	if (fields.pictures) fields.pictures = copyText(fields.pictures);
	// A warm row already dropped its body and kept the excerpt. A fresh projection still has the body.
	const kept = body != null ? boundedExcerpt(body) : boundedExcerpt(excerpt);
	return {...fields, title: copyText(fields.title),
		headings: fields.headings.map(h => ({...h, text: copyText(h.text), slug: copyText(h.slug)})),
		tags: fields.tags.map(copyText), excerpt: kept, file, bag};
}
const ASSET_TOKEN = '\uFFFC', DATA_URL = /data:[a-zA-Z0-9.+\/+-]+;base64,([A-Za-z0-9+/=\s]+)/y;
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|jxl|bmp|ico)$/i;

function fold(s) {
	s = String(s ?? '');
	// ASCII has no marks, sharp s or curved apostrophes. The same fold needs only lowercase.
	return /[^\x00-\x7f]/.test(s) ? s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[‘’]/g, "'").replace(/ß/g, 'ss') : s.toLowerCase();
}
let wordSegmenter;
function wordSegments(s) {
	if (typeof globalThis.Intl?.Segmenter !== 'function') throw new Error('Search needs a newer browser. Update your browser and try again.');
	wordSegmenter ||= new Intl.Segmenter(undefined, {granularity: 'word'});
	// Segment authored text BEFORE folding: stripping marks first changes Thai and Japanese words.
	return wordSegmenter.segment(String(s ?? ''));
}
function wordsOf(s) {
	const words = [];
	for (const part of wordSegments(s)) if (part.isWordLike) words.push(part.segment);
	return words;
}

// Title via notes/model.mjs cardHead: a searched title is the card's.

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
	// The next hash in the text, kept across lines: a line without one is skipped without a search.
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

// Copy unmasked runs in one slice between triggers; the first character decides a region. projection-ab proves the boundary.
function projectBody(text, mask, links, from = 0) {
	let body = '';
	const next = /[\r\n`<\[*_~]|!\[|data:/g;
	const atLink = new Map();
	for (const L of links) if (!atLink.has(L.start)) atLink.set(L.start, L);
	let i = from;
	while (i < text.length) {
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
		// A newline (and the opening BOM) is copied alone so the next turn sees the line's head.
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
	// The shared block grammar decides whether a marker is a list item: paragraph
	// continuations and indented code inside quotes must never invent tasks.
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

export function projectText(text, entry = {}, file = '') {
	// A transient byte projection carries its own coordinate map through the existing pending
	// queue. The index keeps original heading positions and drops this input along with its body.
	const derived = typeof text?.searchText === 'string' && typeof text.mapLink === 'function' ? text : null;
	const s = derived ? derived.searchText : String(text ?? '');
	// Code owns every character: YAML, HTML and Markdown-looking strings are ordinary words,
	// never hidden metadata, links, checklists or media. The filename is its searchable title.
	if (isCodeFile(file)) return {title: file, headings: [], body: s, tags: [], tasks: {open: 0, done: 0},
		hasPicture: false, hasDrawing: false, hasLink: false, ...searchEntry(entry)};
	const {body: rest} = parseFrontMatter(s);
	const restAt = s.length - rest.length;
	const mask = linkMask(s);
	const links = scanLinks(s);
	const lines = rest.replace(/\r\n?/g, '\n').split('\n');
	const head = cardHead(lines);
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
	const body = projectBody(s, mask, links, restAt);
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
	// The line-ending cache earns its place during this projection, not after the note is released.
	crText = null;
	// Presence is sparse: ordinary notes keep their existing projection bytes. Both readers
	// consume the scan above, so a search neither invents another grammar nor scans twice.
	const media = {};
	if (recordingsOf(s, links).length) media.hasRecording = true;
	if (attachmentsOf(s, links).length) media.hasFile = true;
	return {title, headings: heads, body, tags: tagList, tasks, hasPicture, hasDrawing, hasLink, ...media, ...searchEntry(entry)};
}

// A file stamp says nothing about notes.json. Fresh and restored projections use this ONE owner
// for the current sidecar facts; pinning, trash, colour, reminders and dates are never cached.
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

// A projection with the words read in its note's pictures, when there are any. The words are the plug-in's, handed in by
// the index's owner (`pictures`, a map from file to words); the note's own text never carries them.
function withPictures(proj, words) {
	if (typeof words === 'string' && words.trim()) proj.pictures = words;
	return proj;
}
const picturesOf = (holder, file) => typeof holder?.pictures?.get === 'function' ? holder.pictures.get(file) : undefined;

// Bodyless projection and four counted bags. The build fingerprints this module and its dependencies: no hand schema version.
// The last slot is the excerpt. A note whose pictures hold words carries those words and their counted bag just before it.
export function packSearchProjection(note) {
	const row = [note.title, note.headings.map(h => [h.slug, h.text, h.level, h.start]), note.tags.slice(),
		[note.tasks.open, note.tasks.done], note.hasPicture, note.hasDrawing, note.hasLink,
		FIELDS.map(field => [...note.bag[field]]), (note.hasRecording ? 1 : 0) | (note.hasFile ? 2 : 0)];
	if (note.pictures && note.bag.pictures) row.push([note.pictures, [...note.bag.pictures]]);
	row.push(typeof note.excerpt === 'string' ? note.excerpt : '');
	return row;
}

// Malformed or older shapes are a cache miss, never a guessed projection. No repair or migration.
// A nine-slot row, and a ten-slot row whose last slot is picture words, unpack with an empty excerpt.
export function unpackSearchProjection(value) {
	const uint = n => Number.isSafeInteger(n) && n >= 0;
	if (!Array.isArray(value)) return null;
	let row = value, excerpt = '';
	const tail = value.length ? value[value.length - 1] : undefined;
	if ((value.length === 10 || value.length === 11) && typeof tail === 'string') {
		if (tail.length > SEARCH_EXCERPT_CHARS) return null;
		excerpt = tail;
		row = value.slice(0, -1);
	}
	if (row.length !== 9 && row.length !== 10) return null;
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
		// Folded keys can contain apostrophes, dots and other word-like punctuation. Do not
		// resegment them: their original marks are gone. The build identity admits their grammar.
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

// A field's bag is its distinct words with their counts, not every occurrence: a note that says one
// word two thousand times holds it once, the postings take the count, and a word question is a lookup.
function counted(texts) {
	const m = new Map();
	// Consume segments directly, without an occurrence array. Own each distinct token so it
	// cannot retain the body's backing string. Tags stay separate segmentation inputs.
	for (const text of texts) for (const part of wordSegments(text)) if (part.isWordLike) {
		const w = fold(part.segment), count = m.get(w);
		if (count === undefined) m.set(copyText(w), 1); else m.set(w, count + 1);
	}
	return m;
}
function tokenBag(proj) {
	const bag = {title: counted([proj.title]), headings: counted([proj.headings.map(h => h.text).join(' ')]), tags: counted(proj.tags), body: counted([proj.body.replaceAll(ASSET_TOKEN, ' ')])};
	if (proj.pictures) { const words = counted([proj.pictures]); if (words.size) bag.pictures = words; }
	return bag;
}

function addPostings(postings, file, bag, owned) {
	for (const field of fieldsOf(bag)) {
		for (const [tok, count] of bag[field]) {
			let inner = postings.get(tok);
			if (owned && !owned.has(tok)) {
				inner = inner ? new Map(inner) : new Map();
				postings.set(tok, inner);
				owned.add(tok);
			} else if (!inner) { inner = new Map(); postings.set(tok, inner); }
			// The file is absent before adding; only its new records are writable.
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

// `pictures`: the owner's map from file to the words read in that note's pictures; a note is projected with them.
export function beginSearchIndex(texts, index = {}, {pictures = null} = {}) {
	const sidecar = index && typeof index === 'object' ? index : {};
	return slicedState({notes: new Map(), postings: new Map(),
		sections: Array.isArray(sidecar.sections) ? sidecar.sections : [], sidecar, ...(pictures ? {pictures} : {})}, new Map(asMap(texts)));
}

// Only planIndexReuse rows. Same postings writer; no tokenising or scoring here. Queued text outranks a cache arrival.
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

// `own`: grow maps in place (copying was 75% of a 5,000-note build).
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

function updatedSidecar(previous, file, text, entry, own = false) {
	// The sidecar can be borrowed from the folder even when the index maps are owned.
	// Reuse unchanged metadata, never mutate that borrow when invalidating a projection.
	if (own && previous.notes && text != null && (entry === undefined || entry && entry === previous.notes[file])) return previous;
	const entries = {...previous.notes};
	if (text == null) delete entries[file];
	else if (entry !== undefined) entries[file] = entry || {};
	return {...previous, notes: entries};
}

// `queue`: an arrival joins the slices even after the build finished (#257). `own` grows the live queue in place.
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

// Metadata is part of the answer; omitted entries keep it, removal drops it. Predecessors stay intact.
export function updateSearchIndex(sidx, file, text, entry, {queue = false, own = false} = {}) {
	if (sidx.pending instanceof Map) return updateSlicedSearchIndex(sidx, file, text, entry, queue, own);
	if (sidx.partial) throw new TypeError('Update the resumable state, not its partial index');
	// Finish projection before an owned edit touches any map: a refused tokenizer leaves the
	// old index whole. Only the live library opts in; the default still preserves predecessors.
	const previous = sidx.sidecar || {}, nextEntry = entry === undefined ? previous.notes?.[file] : entry;
	const proj = text == null ? null : withPictures(projectText(text, nextEntry || {}, file), picturesOf(sidx, file)), bag = proj && tokenBag(proj);
	const notes = own ? sidx.notes : new Map(sidx.notes), postings = own ? sidx.postings : new Map(sidx.postings);
	const old = notes.get(file), owned = own ? null : new Set();
	const sidecar = updatedSidecar(previous, file, text, entry, own);
	removeFilePostings(postings, file, old && old.bag, owned);
	if (text == null) notes.delete(file);
	else {
		notes.set(file, indexNote(proj, file, bag));
		// A list cloned on removal is already ours on addition, not a second full-list copy.
		addPostings(postings, file, bag, owned);
	}
	return {notes, postings, sections: sidx.sections, sidecar, ...(sidx.pictures ? {pictures: sidx.pictures} : {})};
}

// The words of one note's pictures changed (the plug-in read a new picture, or was deleted): the record and its postings
// change in place of a re-projection, because the note's text may no longer be held. A note not indexed yet takes its
// words from the owner's map when it is projected; `words` null or empty takes them away.
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
	// Only the pictures' share of each posting changes; a word the note's own text holds keeps its posting.
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
		// `pictures:off` leaves the words read in pictures out of the question (the chip); `pictures:on` is the default said aloud.
		const seen = /^pictures:(on|off)(?=[ \t]|$)/i.exec(rest);
		if (seen) {
			filters.pictures = (seen[1].toLowerCase() === 'on') !== neg ? 'on' : 'off';
			i += seen[0].length;
			continue;
		}
		const filt = /^(tag|in|is|has|colour|color|before|after):/i.exec(rest);
		// Negated facets are predicates, not literal words. Date exclusions keep their
		// existing literal meaning; this grammar's negated facets are the five below.
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

// A token containing the literal is sufficient evidence. Its absence is not: Chinese words
// can meet without a space, and a digit can belong to a non-word emoji (1️⃣). Only ASCII letter
// runs cannot cross word boundaries or hide in a non-word segment. They can disprove a literal;
// counts can never prove the order/spacing of several segments. null means read the exact text.
function bodyLiteral(proj, p, bodyReady) {
	if (bodyReady) return fold(proj.body).includes(p);
	if (!p) return true;
	// Σ lower-cases by its surrounding letters, which can lie beyond a word segment.
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
	// The pictures' words are held whole in the record: a literal there is known without a read.
	if (pictures && proj.pictures && fold(proj.pictures.replace(/\s+/g, ' ')).includes(p)) return 'pictures';
	return body === null ? null : '';
}

// One predicate for both signs. An unknown has:/is: value includes nothing, so its
// negation excludes nothing; it can never silently stand for a successful positive filter.
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

// X20: 40 before, 60 after, cut at spaces; never mid-surrogate.
function snippetWindow(field, index, length) {
	let from = Math.max(0, index - 40), to = Math.min(field.length, index + length + 60);
	if (from > 0) {
		const gap = field.slice(from, index).search(/\s/);
		if (gap >= 0) from += gap + 1;
		else if ((field.charCodeAt(from) & 0xFC00) === 0xDC00) from -= 1;
	}
	if (to < field.length) {
		const tail = field.slice(index + length, to); let cut = -1;
		for (let i = tail.length - 1; i >= 0; i--) if (/\s/.test(tail[i])) { cut = i; break; }
		if (cut >= 0) to = index + length + cut;
		else if ((field.charCodeAt(to - 1) & 0xFC00) === 0xD800) to -= 1;
	}
	return [from, to];
}
// Folding can shorten a mark or expand ß/Hangul. Walk only to the hit, mapping the folded
// interval back to the original code points; following stripped marks still belong to the hit.
function foldedRange(field, needle) {
	const wanted = fold(needle);
	if (!wanted) return null;
	const at = fold(field).indexOf(wanted);
	if (at < 0) return null;
	const end = at + wanted.length;
	let folded = 0, source = 0, from = -1, to = 0;
	for (const point of field) {
		const length = fold(point).length;
		if (length && folded <= at && at < folded + length) from = source;
		if (folded < end && folded + length > at || !length && from >= 0 && folded === end) to = source + point.length;
		folded += length; source += point.length;
		if (folded > end) break;
	}
	return {from, to};
}
export function snippetFor(note, query, text) {
	if (typeof text !== 'string') throw new TypeError('Snippet needs exact text for ' + note.file);
	const q = searchQuery(query);
	const needles = [...q.phrases, ...q.words];
	const proj = projectText(text, {}, note.file);
	const fields = [proj.title, proj.headings.map(h => h.text).join(' · '), proj.body.replaceAll(ASSET_TOKEN, ' ')].filter(Boolean);
	for (const needle of needles) for (const field of fields) {
		const hit = foldedRange(field, needle);
		if (!hit) continue;
		const [from0, to0] = snippetWindow(field, hit.from, hit.to - hit.from), prefix = from0 > 0 ? 1 : 0;
		return {text: copyText((prefix ? '…' : '') + field.slice(from0, to0) + (to0 < field.length ? '…' : '')),
			from: prefix + hit.from - from0, to: prefix + hit.to - from0};
	}
	// Words found only in a picture: the snippet is cut from what the picture says, and says so (`picture`).
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

// A body's arrival can change its title, tags, tasks and token fields too. One scorer is used for
// the indexed candidate and for its fresh projection; a confirmation never trusts a stale excerpt.
function rankNote(proj, file, sidx, q, bodyReady, words) {
	const f = q.filters, pictures = f.pictures !== 'off';
	if (!passesFilters(proj, file, sidx, f, q.excludedFilters)) return null;
	let pending = false;
	for (const n of q.negations) {
		// An exclusion is a literal too; a word's isolated case is not its field's case.
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
	// Keep all certain ranks until the unresolved candidates are settled. Limiting candidates here
	// could leave an empty first page after rejections while valid lower-ranked notes go unread.
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
	// Fold the question once, not again for every candidate and every confirmation. A word can fold
	// to '' (U+16FE4 is word-like and all mark): the last word is a prefix by being there, here and in rankNote.
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
		const proj = sidx.notes.get(file);
		if (!proj) continue;
		const ranked = rankNote(proj, file, sidx, q, false, wordList);
		if (!ranked) continue;
		if (ranked.pending) {
			if (ordered) ordered.push(ranked.row);
			// No bag, note record or index is captured: only the entry/section facts a fresh projection
			// needs. Snapshot them before an owned indexing slice or a shell edit can replace them.
			pending.push({file, entry: structuredClone(sidx.sidecar?.notes?.[file] || {
				category: proj.category, pinned: proj.pinned, archived: proj.archived, trashed: proj.trashed,
				remind: proj.remind, colour: proj.colour, created: proj.created, modified: proj.modified,
			}), ...(proj.pictures ? {pictures: proj.pictures} : {})});
		} else rows.push(ranked.row);
	}
	const answer = rankedAnswer(rows, pending, q, limit, pending.length ? structuredClone(sidx.sections) : [], sidx);
	// A pending phrase has only the index's provisional score. Exact scoring still belongs to
	// confirmSearch; candidate order never makes an index row permission to paint a hit.
	if (ordered) answer.candidates = (pending.length ? rows.concat(ordered).sort(compareRank) : rows).map(row => row.file);
	return answer;
}

// Read a batch, confirm it, release its exact texts, repeat with the remaining confirm list. A
// missing key is unresolved; a present non-string is a failed read, never a blank note. No answer
// or caller Map is mutated, so cancelled/superseded questions can simply drop their continuation.
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
		// Exact literals read fields, not word bags. Keep the same grammar refusal without counting unused words.
		if (words.length) proj.bag = tokenBag(proj); else wordSegments('');
		const ranked = rankNote(proj, file, {sections, sidecar: {notes: {[file]: entry}}}, query, true, words);
		if (ranked) rows.push(ranked.row);
	}
	const confirmed = rankedAnswer(rows, remaining, query, limit, sections, answer);
	// Exact results gain their own ranks; pending reads retain the original provisional order.
	if (answer.candidates) confirmed.candidates = answer.candidates;
	return confirmed;
}

// Holds decisions and the confirmation continuation only. REQUIRED: sidx from the live library owner after its freshness gate.
// LibraryTouch/Fresh retire the old run after a change; this cannot observe mutations.
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
		// An entry mismatch is an additional conservative refusal, not a body-freshness proof. The
		// live-owner precondition above authorizes index negatives. No index survives this snapshot.
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

// Row descriptors are derived from the same pending continuation the exact verifier consumes.
// Failed reads stay unresolved but are not silently retried by a later paint or plan request.
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
	// This is the existing exact scorer, also for simple words and metadata-only filters. A derived
	// search plan is never a valid text receipt; original-string provenance belongs to the read owner.
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

// The quick switcher reads titles and the bounded excerpt only. It does not read bodies, and a word
// that lives only past the excerpt is not a hit. Title matches outrank first-word matches; recency breaks ties.
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
	return coversTokens(folded.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [], words);
}

export function switcherCatalogue(index, documents = []) {
	const rows = [];
	const notes = index && index.notes;
	if (notes && typeof notes.entries === 'function') {
		for (const [id, note] of notes) {
			if (!note || note.trashed === true) continue;
			rows.push({
				kind: 'note',
				id,
				title: typeof note.title === 'string' ? note.title : '',
				first: typeof note.excerpt === 'string' ? note.excerpt : '',
				modified: Number.isFinite(note.modified) ? note.modified : 0,
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
