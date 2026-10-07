// SPDX-License-Identifier: AGPL-3.0-only
import { annotateMarkdownLayout } from '../layout/markdown.mjs';
import { dataImage, markdownParser, markdownBodyOffset, documentAssets } from '../images/assets.mjs';
import { FIND_KINDS } from './structure-request.mjs';

function _rapierOutlineHeadingLevel(raw) {
	const text = String(raw || '');
	const atx = /^ {0,3}(#{1,6})(?:[ \t]|$)/.exec(text);
	if (atx) return atx[1].length;
	/* A rule of = or - underlines a setext heading only when a paragraph
		 sits above it; same bytes alone are a thematic break. Only the first
		 and last line decide — neither found by splitting the whole block. */
	const firstBreak = text.indexOf('\n');
	if (firstBreak < 0) return 0;
	const rule = text.slice(text.lastIndexOf('\n') + 1);
	if (!text.slice(0, firstBreak).trim() || !/^ {0,3}(?:=+|-+)[ \t]*$/.test(rule)) return 0;
	return rule.trim().charAt(0) === '=' ? 1 : 2;
}

function _rapierOutlineHeadingLabel(raw, parserFactory = globalThis.markdownit) {
	if (String(raw || '').includes('md-layout:') && typeof parserFactory === 'function') {
		const entry = outlineMarkdown(raw, {limit: 1}, parserFactory).entries[0];
		if (entry) return entry.label;
	}
	const lines = String(raw || '').split('\n');
	const atx = /^ {0,3}#{1,6}(?:[ \t]+([^\n]*?))?[ \t]*$/.exec(lines[0]);
	if (atx) return String(atx[1] || '').replace(/[ \t]+#+[ \t]*$/, '').trim();
	return (lines.length > 1 ? lines.slice(0, -1).join(' ') : lines[0]).trim();
}

function _rapierOutlineTrimmedEnd(text, start, stop) {
	let end = Math.max(start, Math.min(Number(stop), text.length));
	while (end > start && /[ \t\r\n]/.test(text.charAt(end - 1))) end -= 1;
	return end;
}

function _rapierSourcePassagesOf(text) {
	const passages = [];
	let fence = '';
	let start = -1;
	let lineStart = 0;
	const flush = stop => {
		if (start < 0) return;
		const end = _rapierOutlineTrimmedEnd(text, start, stop);
		const raw = text.slice(start, end);
		if (raw) passages.push({ blockId: null, raw, level: _rapierOutlineHeadingLevel(raw), start });
		start = -1;
	};
	while (lineStart <= text.length) {
		const nextBreak = text.indexOf('\n', lineStart);
		const line = text.slice(lineStart, nextBreak < 0 ? text.length : nextBreak);
		const fenceMark = /^ {0,3}(`{3,}|~{3,})/.exec(line);
		/* Same rule as _rapierOutlineFromSource: a closing fence carries nothing after the fence characters but whitespace, matching markdown-it's own fence rule exactly. */
		if (fence) {
			if (fenceMark && fenceMark[1].charAt(0) === fence.charAt(0) &&
					fenceMark[1].length >= fence.length && !line.slice(fenceMark[0].length).trim()) fence = '';
		} else if (fenceMark) {
			if (start < 0) start = lineStart;
			fence = fenceMark[1];
		} else if (!line.trim()) {
			flush(lineStart);
		} else if (start < 0) {
			start = lineStart;
		}
		if (nextBreak < 0) break;
		lineStart = nextBreak + 1;
	}
	flush(text.length);
	return passages;
}

function _rapierScanSourceHeadings(text, limit) {
	const passages = _rapierSourcePassagesOf(String(text || ''));
	const cap = Math.max(0, Number(limit) || 0);
	let total = 0;
	const kept = [];
	for (const passage of passages) {
		if (!passage.level) continue;
		total += 1;
		if (kept.length < cap) kept.push(passage);
	}
	const buffer = new Int32Array(kept.length * 3);
	for (let index = 0; index < kept.length; index++) {
		const passage = kept[index];
		buffer[index * 3] = passage.start;
		buffer[index * 3 + 1] = passage.start + passage.raw.length;
		buffer[index * 3 + 2] = passage.level;
	}
	return { buffer: buffer.buffer, total };
}

function imageMetadata(image, assets) {
	const destination = image.attrGet('src') || '', data = dataImage(destination);
	if (!data) return {profile: 'linked'};
	const id = image.meta?.mdImage?.reference, record = id && assets.get(id);
	return {profile: 'embedded', mime: data.codec, bytes: data.byteLength,
		...(id ? {id, assetStatus: record?.status || 'missing'} : {}),
		...(isDrawing(record?.url || destination) ? {drawing: true} : {})};
}

// The recipe <metadata id="rapier-draw"> follows the root element: a bounded prefix decode suffices.
function isDrawing(url) {
	if (!/^data:image\/svg\+xml;base64,/i.test(url || '')) return false;
	const payload = url.slice(url.indexOf(',') + 1, url.indexOf(',') + 1 + 1200);
	try { return atob(payload.slice(0, payload.length - payload.length % 4)).includes('<metadata id="rapier-draw">'); }
	catch (_) { return false; }
}

// The block pass the outline and the structure search share. Front matter is blanked and line endings made LF so the parser sees the
// Markdown alone; the image-asset appendix is left out; `starts` (original) and `normalizedStarts` (LF) keep every offset canonical.
function markdownBlocks(source, parserFactory) {
	const maxChars = 8 * 1024 * 1024, maxLines = 100000, maxTokens = 65536;
	const assetIndex = documentAssets(source, parserFactory), contentEnd = assetIndex.appendixStart;
	let stop = Math.min(contentEnd, maxChars), bounded = stop < contentEnd;
	if (bounded) stop = Math.max(0, source.lastIndexOf('\n', stop));
	const starts = [0], normalizedStarts = [0];
	let crlf = 0;
	for (let at = 0; at < stop; at++) {
		if (source.charCodeAt(at) === 13) {
			if (at + 1 < stop && source.charCodeAt(at + 1) === 10) { at++; crlf++; }
		} else if (source.charCodeAt(at) !== 10) continue;
		starts.push(at + 1);
		normalizedStarts.push(at + 1 - crlf);
		if (starts.length >= maxLines) { stop = at + 1; bounded = stop < contentEnd; break; }
	}
	const originalOffset = offset => {
		let low = 0, high = normalizedStarts.length;
		while (low + 1 < high) {
			const mid = (low + high) >>> 1;
			if (normalizedStarts[mid] <= offset) low = mid; else high = mid;
		}
		return starts[low] + offset - normalizedStarts[low];
	};
	const raw = source.slice(0, stop), bodyOffset = Math.min(stop, markdownBodyOffset(source));
	// Keep canonical offsets while excluding metadata from Markdown semantics.
	const input = (raw.slice(0, bodyOffset).replace(/[^\r\n]/g, ' ') + raw.slice(bodyOffset)).replace(/\r\n?/g, '\n');
	const parser = markdownParser(parserFactory);
	const env = {references: Object.assign(Object.create(null), assetIndex.references)};
	const tokens = [], state = new parser.block.State(input, parser, env, tokens);
	tokens.push = function (...rows) {
		if (tokens.length + rows.length > maxTokens) throw new RangeError('markdown_token_bound');
		return Array.prototype.push.apply(this, rows);
	};
	try { parser.block.tokenize(state, state.line, state.lineMax); }
	catch (error) {
		if (!(error instanceof RangeError) || error.message !== 'markdown_token_bound') throw error;
		bounded = true;
	}
	finally { delete tokens.push; }
	return {assetIndex, stop, bounded, starts, normalizedStarts, originalOffset, input, parser, env, state, tokens, maxTokens};
}

function outlineMarkdown(text, options = {}, parserFactory) {
	const source = String(text || '');
	if (typeof parserFactory !== 'function' && !parserFactory?.block) return {entries: [], total: 0, complete: false, reason: 'markdown_parser_unavailable'};
	const cap = Math.max(0, Math.min(2048, Number(options.limit ?? 2048)));
	const pass = markdownBlocks(source, parserFactory);
	const {assetIndex, stop, starts, originalOffset, input, parser, state, tokens, maxTokens} = pass;
	let bounded = pass.bounded;
	let inlineTokens = 0;
	try {
		for (const token of tokens) {
			if (token.type !== 'inline' || !token.content.includes('md-layout:') && !token.content.includes('![')) continue;
			const children = [];
			children.push = function (...rows) {
				if (tokens.length + inlineTokens + rows.length > maxTokens) throw new RangeError('markdown_token_bound');
				inlineTokens += rows.length;
				return Array.prototype.push.apply(this, rows);
			};
			try { parser.inline.parse(token.content, parser, state.env, children); token.children = children; }
			finally { delete children.push; }
		}
	} catch (error) {
		if (!(error instanceof RangeError) || error.message !== 'markdown_token_bound') throw error;
		bounded = true;
	}
	annotateMarkdownLayout({src: input, tokens});
	const blocks = [];
	for (const token of tokens) {
		if (token.level !== 0 || token.nesting < 0 || !token.map) continue;
		const start = starts[token.map[0]], end = starts[token.map[1]] ?? stop;
		if (Number.isSafeInteger(start) && end > start && end <= stop) blocks.push({start, end});
	}
	const images = [];
	let imageTotal = 0;
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		if (token.type !== 'inline' || !token.children) continue;
		const map = token.map || tokens[index - 1]?.map;
		let imageIndex = 0;
		for (const image of token.children) {
			if (image.type !== 'image') continue;
			imageTotal++;
			const occurrence = imageIndex++;
			if (images.length >= 2048) continue;
			const blockStart = starts[map?.[0]], blockEnd = starts[map?.[1]] ?? stop;
			if (!Number.isSafeInteger(blockStart) || blockEnd <= blockStart) { bounded = true; continue; }
			images.push({blockStart, blockEnd, index: occurrence,
				alt: parser.renderer.renderInlineAsText(image.children || [], parser.options, state.env).slice(0, 192),
				...imageMetadata(image, assetIndex.assets), ...(image.meta?.mdLayout?.layout || {})});
		}
	}
	const layouts = [], layoutFaults = [];
	let layoutTotal = 0;
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index], fact = token.type === 'inline' && token.meta?.mdLayout;
		const target = token.meta?.mdLayoutSource;
		const fault = token.type === 'inline' && token.meta?.mdLayoutFault;
		if (fault && layoutFaults.length < 32) {
			const at = typeof token.content === 'string' ? token.content.lastIndexOf(fault.marker) : -1;
			const start = target && at >= 0 ? originalOffset(target.start) : null;
			layoutFaults.push({reason: fault.reason, ...(start != null ? {blockStart: start, blockEnd: originalOffset(target.end)} : {})});
		}
		if (!fact || !target?.marker) continue;
		const start = originalOffset(target.marker.start), end = originalOffset(target.marker.end);
		if (source.slice(start, end) !== fact.marker) { bounded = true; continue; }
		layoutTotal++;
		if (layouts.length < 2048) layouts.push({start, end, blockStart: originalOffset(target.start), blockEnd: originalOffset(target.end),
			kind: tokens[index - 1]?.type === 'heading_open' ? 'heading' : fact.imageOnly ? 'image' : 'paragraph', ...fact.layout});
	}
	const entries = [];
	let total = 0, brief = null;
	// The continuation brief is for the assistants, not the person: it rides in the file as one top-level HTML
	// comment, `<!-- continuation brief ... -->`, which no Markdown reader shows, and Rapier neither shows nor
	// exports. Quotes, lists and code are examples, not the brief.
	for (const token of tokens) {
		if (brief || token.type !== 'html_block' || token.level !== 0 || !token.map) continue;
		if (!/^<!--[ \t]*continuation[ \t]+brief\b[\s\S]*-->[ \t]*\r?\n?$/i.test(token.content)) continue;
		const start = starts[token.map[0]], end = _rapierOutlineTrimmedEnd(source, start, starts[token.map[1]] ?? stop);
		if (Number.isSafeInteger(start) && end > start) brief = {start, end, closed: true};
	}
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		if (token.type !== 'heading_open' || !token.map) continue;
		const inline = tokens[index + 1];
		if (!inline || inline.type !== 'inline') { bounded = true; continue; }
		total++;
		if (entries.length >= cap) continue;
		const start = starts[token.map[0]], end = starts[token.map[1]] ?? stop;
		if (!Number.isSafeInteger(start) || end < start) { bounded = true; continue; }
		let label = inline.content;
		const layout = inline.meta?.mdLayout;
		if (layout) {
			const markerAt = label.lastIndexOf(layout.marker);
			if (markerAt >= 0 && !label.slice(markerAt + layout.marker.length).trim()) label = label.slice(0, markerAt);
		}
		entries.push({start, end: _rapierOutlineTrimmedEnd(source, start, end), level: Number(token.tag.slice(1)),
			label: label.replace(/[ \t\r\n]+/g, ' ').trim().slice(0, 192), ...(layout ? {layout: layout.layout} : {})});
	}
	const omitted = Math.max(0, total - entries.length);
	return {entries, total, engine: 'markdown-it', complete: !bounded && omitted === 0,
		...(brief ? {brief: {start: brief.start, end: brief.end, complete: true}} : {}),
		blocks: {entries: blocks, complete: !bounded},
		images: {entries: images, total: imageTotal, complete: !bounded && images.length === imageTotal,
			assetRecords: assetIndex.blocks.filter(row => row.active).length,
			declaredAssetBytes: assetIndex.blocks.reduce((sum, row) => sum + (row.active ? row.byteLength || 0 : 0), 0),
			...(bounded ? {reason: 'markdown_work_bound'} : {})},
		layout: {entries: layouts, total: layoutTotal, complete: !bounded && layouts.length === layoutTotal,
			omitted: layoutTotal - layouts.length, faults: layoutFaults, ...(bounded ? {reason: 'markdown_work_bound'} : {})},
		omitted, truncated: bounded || omitted > 0, ...(bounded ? {reason: 'markdown_work_bound'} : {})};
}

// `document.find` by kind over a Markdown document: the elements the parser that renders it finds, each an exact source range in
// UTF-16 units, as agent/structure.mjs answers for code. A block element (heading, list, item, task, table, row, fence, quote, footnote
// definition) spans its source lines, as an outline entry does; a paragraph, link, image or footnote reference spans its own characters.
// The query is a substring, ignoring case, of the element's own words (what a nested list, item or quote holds is its own), of a fence's
// language, a link's text or href, an image's alt, label or path, a footnote's label or note; `#` to `######` picks a heading level and
// `[ ]` or `[x]` a task state; an empty query is every element of the kind. Raw HTML is the parser's html, never a link or an image here.
const _rapierTaskMarker = /^\[( |x|X)\] /;
const _rapierObservedInline = new Set(['link_close', 'image', 'footnote_ref', 'code_inline', 'html_inline']);
const _rapierFoldQuery = text => String(text).toLocaleLowerCase('und');

function _rapierPlainInline(children, withImages) {
	let text = '';
	for (const child of children || []) {
		if (child.type === 'text' || child.type === 'text_special' || child.type === 'code_inline') text += child.content;
		else if (child.type === 'softbreak' || child.type === 'hardbreak') text += ' ';
		else if (withImages && child.type === 'image') text += _rapierPlainInline(child.children, true);
	}
	return text;
}

function structureMarkdown(request, parserFactory) {
	const unavailable = reason => ({ok: false, complete: false, status: 'unavailable', reason});
	const source = String(request?.source || '');
	if (typeof parserFactory !== 'function' && !parserFactory?.block) return unavailable('structure_unavailable');
	const kinds = (Array.isArray(request.kinds) ? request.kinds : []).filter(kind => FIND_KINDS.markdown.includes(kind));
	if (!kinds.length) return unavailable('kind_not_applicable');
	// Only the parser the document is rendered with answers: the footnote rule and the linkifier are its spec, and a plain markdown-it would
	// find other elements (a footnote definition as a paragraph, no bare address).
	const configured = markdownParser(parserFactory);
	if (configured.block.ruler.__find__('footnote_def') < 0 || !configured.options.linkify) return unavailable('structure_unavailable');
	const wants = kind => kinds.includes(kind);
	const query = String(request.query || ''), needle = _rapierFoldQuery(query);
	const levelQuery = /^#{1,6}$/.test(query) ? query.length : 0;
	const taskQuery = query === '[ ]' ? 'open' : /^\[[xX]\]$/.test(query) ? 'done' : '';
	const has = pieces => !needle || pieces.some(piece => _rapierFoldQuery(piece).includes(needle));
	const within = request.within && Number.isFinite(Number(request.within.start)) ? {start: Number(request.within.start), end: Number(request.within.end)} : null;
	const pass = markdownBlocks(source, parserFactory);
	const {stop, starts, normalizedStarts, originalOffset, input, parser, state, tokens} = pass;
	let bounded = pass.bounded, unmapped = 0, inlineBudget = 262144;
	const lineN = line => line < normalizedStarts.length ? normalizedStarts[line] : input.length;
	const lineRange = map => {
		const start = starts[map[0]];
		return Number.isSafeInteger(start) ? {start, end: _rapierOutlineTrimmedEnd(source, start, starts[map[1]] ?? stop)} : null;
	};
	// A private view of the same parser observes where each inline rule matched; it changes no live rule or token.
	const seen = new WeakMap(), wrapped = new Map();
	const view = Object.create(parser), inlineView = Object.create(parser.inline), ruler = Object.create(parser.inline.ruler);
	view.inline = inlineView; inlineView.ruler = ruler;
	ruler.getRules = chain => {
		if (!wrapped.has(chain)) wrapped.set(chain, parser.inline.ruler.getRules(chain).map(rule => (inlineState, silent) => {
			const first = inlineState.tokens.length, begin = inlineState.pos, matched = rule(inlineState, silent), token = inlineState.tokens.at(-1);
			if (matched && !silent && inlineState.tokens.length > first && !seen.has(token) && _rapierObservedInline.has(token.type)) {
				seen.set(token, {start: begin, end: inlineState.pos, source: inlineState.src});
			}
			return matched;
		}));
		return wrapped.get(chain);
	};
	const parseInline = content => {
		const children = [];
		children.push = function (...rows) {
			if ((inlineBudget -= rows.length) < 0) throw new RangeError('markdown_token_bound');
			return Array.prototype.push.apply(this, rows);
		};
		try { inlineView.parse(content, view, state.env, children); }
		finally { delete children.push; }
		return children;
	};
	// Inline content is the block's source lines without their container prefixes; a table cell is its row's text with `\|` read as `|`.
	const rowSource = token => {
		const from = lineN(token.map[0]), to = lineN(token.map[0] + 1), offsets = [];
		let text = '';
		for (let at = from; at < to; at++) {
			if (input[at] === '\\' && input[at + 1] === '|') at++;
			offsets.push(at); text += input[at];
		}
		offsets.push(to);
		return {text, offsets, at: 0};
	};
	const inlineOffsets = (token, row) => {
		if (token.map) {
			const rows = token.content.split('\n'), where = [], begin = [];
			let local = 0;
			for (let at = 0; at < rows.length; at++) {
				const from = lineN(token.map[0] + at), found = input.slice(from, lineN(token.map[0] + at + 1)).indexOf(rows[at]);
				if (found < 0) return null;
				begin.push(local); where.push(from + found); local += rows[at].length + 1;
			}
			return position => {
				let at = begin.length - 1;
				while (at > 0 && begin[at] > position) at--;
				return where[at] + position - begin[at];
			};
		}
		if (!row || row.broken) return null;
		const found = row.text.indexOf(token.content, row.at);
		if (found < 0) { row.broken = true; return null; }
		row.at = found + token.content.length;
		return position => row.offsets[found + position];
	};
	const candidates = [], blockHits = new WeakMap();
	const nearest = Object.create(null), nesting = [];
	const containers = {bullet_list_open: ['list', 'bullet_list_close'], ordered_list_open: ['list', 'ordered_list_close'], list_item_open: ['item', 'list_item_close'],
		blockquote_open: ['quote', 'blockquote_close'], table_open: ['table', 'table_close'], tr_open: ['row', 'tr_close'], footnote_reference_open: ['footnote', 'footnote_reference_close']};
	const closers = new Set(Object.values(containers).map(entry => entry[1]));
	const spanKinds = wants('link') || wants('image') || wants('footnote');
	const inlineNeeded = !(kinds.length === 1 && kinds[0] === 'fence');
	let row = null;
	const spanHit = (kind, map, content, a, b, pieces, cell) => {
		const from = map(a), to = map(b);
		if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from) { unmapped++; return null; }
		// A span within one line must read the same in the source as in the parser's content.
		const wasContent = content.slice(a, b), wasSource = input.slice(from, to);
		if (!wasContent.includes('\n') && wasSource !== wasContent && !(cell && wasSource.replace(/\\\|/g, '|') === wasContent)) { unmapped++; return null; }
		const hit = {kind, start: originalOffset(from), end: originalOffset(to), pieces};
		candidates.push(hit);
		return hit;
	};
	scan: for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		if (closers.has(token.type)) {
			const done = nesting.pop();
			if (done?.kind === 'footnote' && done.hit?.first != null) {
				const hit = done.hit, at = input.indexOf('[^', lineN(hit.first));
				if (at >= 0 && at < lineN(hit.first + 1)) { hit.start = originalOffset(at); hit.end = _rapierOutlineTrimmedEnd(source, hit.start, starts[hit.last] ?? stop); candidates.push(hit); } else unmapped++;
			}
			if (done) nearest[done.kind] = done.prev;
			continue;
		}
		if (containers[token.type]) {
			const kind = containers[token.type][0];
			let hit = null;
			if (kind === 'footnote') { if (wants('footnote')) hit = {kind: 'footnote', pieces: [String(token.meta?.label || '')], first: null, last: 0}; }
			else if (token.map && (wants(kind) || kind === 'item' && wants('task'))) {
				const range = lineRange(token.map);
				if (range) { hit = {kind, ...range, pieces: []}; candidates.push(hit); if (kind === 'item') { hit.task = ''; blockHits.set(token, hit); } }
				else bounded = true;
			}
			nesting.push({kind, prev: nearest[kind], hit});
			nearest[kind] = hit;
			if (kind === 'row' && token.map && spanKinds) row = rowSource(token);
			continue;
		}
		if (nearest.footnote && token.map) {
			const hit = nearest.footnote;
			hit.first = hit.first == null ? token.map[0] : Math.min(hit.first, token.map[0]);
			hit.last = Math.max(hit.last, token.map[1]);
		}
		if (token.type === 'fence') {
			if (wants('fence') && token.map) {
				const range = lineRange(token.map);
				if (range) candidates.push({kind: 'fence', ...range, pieces: [String(token.info || '').trim().split(/\s+/)[0]]});
			}
		} else if (token.type === 'heading_open') {
			const range = wants('heading') && token.map && lineRange(token.map);
			if (range) { const hit = {kind: 'heading', ...range, level: Number(token.tag.slice(1)), pieces: []}; candidates.push(hit); blockHits.set(token, hit); }
		} else if (token.type === 'paragraph_open') {
			if (wants('paragraph') && !token.hidden) blockHits.set(token, {kind: 'paragraph', pieces: []});
		} else if (token.type === 'inline' && inlineNeeded) {
			const above = tokens[index - 1], content = token.content;
			let children;
			try { children = parseInline(content); }
			catch (error) {
				if (!(error instanceof RangeError) || error.message !== 'markdown_token_bound') throw error;
				bounded = true; break scan;
			}
			const plain = _rapierPlainInline(children, false);
			let pieces = plain === content ? [plain] : [plain, content];
			const owner = above?.type === 'paragraph_open' ? blockHits.get(tokens[index - 2]) : null, item = owner?.kind === 'item' ? owner : null;
			const marker = item && _rapierTaskMarker.exec(content);
			if (marker) {
				item.task = marker[1] === ' ' ? 'open' : 'done';
				pieces = pieces.map(piece => piece.replace(_rapierTaskMarker, ''));
			}
			const block = blockHits.get(above);
			if (block) block.pieces.push(...pieces);
			for (const kind of ['item', 'list', 'quote', 'table', 'row', 'footnote']) nearest[kind]?.pieces.push(...pieces);
			const paragraph = block?.kind === 'paragraph';
			if (!(paragraph || spanKinds)) continue;
			const map = inlineOffsets(token, row);
			if (!map) {
				if (paragraph || children.some(child => _rapierObservedInline.has(child.type))) unmapped++;
				continue;
			}
			if (paragraph && content) {
				const from = map(0), to = map(content.length);
				if (Number.isSafeInteger(from) && Number.isSafeInteger(to) && to > from) { block.start = originalOffset(from); block.end = originalOffset(to); candidates.push(block); }
				else unmapped++;
			}
			if (!spanKinds) continue;
			const cell = !token.map, links = [];
			let cursor = 0, anchors = 0;
			for (let at = 0; at < children.length; at++) {
				const child = children[at], span = seen.get(child);
				if (child.type === 'link_open') links.push(at);
				else if (child.type === 'link_close') {
					const open = links.pop();
					if (open != null && span && span.source === content) {
						cursor = Math.max(cursor, span.end);
						if (wants('link')) {
							const first = children[open], href = first.attrGet('href') || '', title = first.attrGet('title') || '', words = _rapierPlainInline(children.slice(open + 1, at), true);
							// The parser's own linkifier takes an address from where its `://` stands; the scheme before it is part of the link.
							const scheme = first.markup === 'linkify' ? words.indexOf('://') : 0;
							if (scheme >= 0 && (!scheme || content.startsWith(words.slice(0, scheme + 3), span.start - scheme))) {
								spanHit('link', map, content, span.start - scheme, span.end, [words, href, title].filter(Boolean), cell);
							} else unmapped++;
						}
					}
				} else if (span && span.source === content) {
					cursor = Math.max(cursor, span.end);
					if (child.type === 'html_inline') anchors += /^<a[\s>]/i.test(child.content) ? 1 : /^<\/a\s*>/i.test(child.content) ? -1 : 0;
					else if (child.type === 'image' && wants('image')) {
						const src = child.attrGet('src') || '', label = child.meta?.mdImage?.reference || '';
						spanHit('image', map, content, span.start, span.end, [_rapierPlainInline(child.children, true), label, /^data:/i.test(src) || src.length > 2048 ? '' : src].filter(Boolean), cell);
					} else if (child.type === 'footnote_ref' && wants('footnote')) {
						const note = child.meta?.label ? null : state.env.footnotes?.list?.[child.meta?.id];
						spanHit('footnote', map, content, span.start, span.end, [child.meta?.label || _rapierPlainInline(note?.tokens, true) || note?.content || ''].filter(Boolean), cell);
					}
				} else if (child.type === 'text_special' && child.markup) {
					// A token the content does not hold where expected ends the scan of this inline token; nothing after it is placed by guess.
					const found = content.indexOf(child.markup, cursor);
					cursor = found >= 0 ? found + child.markup.length : content.length + 1;
				} else if (child.type === 'text' && child.content) {
					const found = content.indexOf(child.content, cursor);
					if (found < 0) {
						cursor = content.length + 1;
						if (wants('link') && parser.linkify?.test(child.content)) unmapped++;
						continue;
					}
					cursor = found + child.content.length;
					// A bare address the renderer links (linkify) is a link too; the same linkifier finds it in the same words.
					if (links.length || anchors > 0 || !wants('link') || !parser.options.linkify || !parser.linkify?.test(child.content)) continue;
					for (const match of parser.linkify.match(child.content) || []) {
						if (!parser.validateLink(parser.normalizeLink(match.url))) continue;
						const hit = spanHit('link', map, content, found + match.index, found + match.lastIndex, [match.text, match.url], cell);
						if (hit && source.slice(hit.start, hit.end) !== match.raw) { candidates.pop(); unmapped++; }
					}
				}
			}
		}
	}
	const named = candidates.flatMap(hit => hit.kind === 'item' && hit.task && wants('task') ? [hit, {...hit, kind: 'task'}] : [hit]);
	const found = named.filter(hit => wants(hit.kind) && Number.isSafeInteger(hit.start) && hit.end > hit.start &&
		(!within || hit.start >= within.start && hit.end <= within.end) &&
		(hit.kind === 'heading' && levelQuery ? hit.level === levelQuery : hit.kind === 'task' && taskQuery ? hit.task === taskQuery : has(hit.pieces)))
		.sort((a, b) => a.start - b.start || a.end - b.end);
	const offset = Math.max(0, Math.floor(Number(request.matchOffset) || 0)), pageSize = Math.max(1, Math.floor(Number(request.matchLimit) || 200));
	const matches = found.slice(offset, offset + pageSize).map(hit => ({kind: hit.kind, name: String(hit.pieces[0] || '').slice(0, 192), start: hit.start, end: hit.end, container: ''}));
	const complete = !bounded && unmapped === 0;
	const remaining = Math.max(0, found.length - offset - matches.length);
	return {ok: true, engine: 'markdown-it', kind: 'markdown', mode: 'find', chars: source.length, status: complete ? 'ok' : 'bounded', complete,
		omissions: [...bounded ? [{domain: 'markdown', reason: 'markdown_work_bound'}] : [], ...unmapped ? [{domain: 'markdown', reason: 'source_unmapped', observed: unmapped}] : []],
		truncated: !complete, matches, counted: found.length, matchOffset: offset, remaining, windowed: true, overflow: remaining > 0};
}

export {
	_rapierOutlineHeadingLevel,
	_rapierOutlineHeadingLabel,
	_rapierOutlineTrimmedEnd,
	_rapierSourcePassagesOf,
	_rapierScanSourceHeadings,
	outlineMarkdown,
	structureMarkdown
};
