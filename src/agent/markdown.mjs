// SPDX-License-Identifier: AGPL-3.0-only
import { annotateMarkdownLayout } from '../layout/markdown.mjs';
import { dataImage, markdownParser, markdownBodyOffset, documentAssets } from '../images/assets.mjs';

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

function outlineMarkdown(text, options = {}, parserFactory) {
	const source = String(text || '');
	if (typeof parserFactory !== 'function' && !parserFactory?.block) return {entries: [], total: 0, complete: false, reason: 'markdown_parser_unavailable'};
	const cap = Math.max(0, Math.min(2048, Number(options.limit ?? 2048)));
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
	// The continuation brief is for the assistants, not the person (the founder, 27 September): it rides in the file as
	// one top-level HTML comment, `<!-- continuation brief ... -->`, which no Markdown reader shows, and Rapier neither
	// shows nor exports. Quotes, lists and code are examples, not the brief.
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

export {
	_rapierOutlineHeadingLevel,
	_rapierOutlineHeadingLabel,
	_rapierOutlineTrimmedEnd,
	_rapierSourcePassagesOf,
	_rapierScanSourceHeadings,
	outlineMarkdown
};
