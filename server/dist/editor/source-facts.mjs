// SPDX-License-Identifier: AGPL-3.0-only

function _rapierLineStartOffsets(source) {
	const offsets = [0];
	const endings = /\r\n?|\n/g;
	while (endings.exec(source)) offsets.push(endings.lastIndex);
	return offsets;
}

function _rapierSourceLineSpan(source, offsets, startLine, endLine) {
	const start = startLine < offsets.length ? offsets[startLine] : source.length;
	let end = endLine < offsets.length ? offsets[endLine] : source.length;
	if (end > start && source.charCodeAt(end - 1) === 10) end -= 1;
	if (end > start && source.charCodeAt(end - 1) === 13) end -= 1;
	return { start, end };
}

function _rapierHeadingSlugBase(text) {
	return String(text == null ? '' : text).trim().toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '') || 'heading';
}

function _rapierNextHeadingSlug(base, used) {
	let slug = base;
	while (Object.hasOwn(used, slug)) slug = base + '-' + (++used[base]);
	used[slug] = 0;
	return slug;
}

function _rapierCollectTokenFacts(markdown, tokens, slugBase, normalizeReference, env, lineOffsets) {
	const source = String(markdown || '');
	const offsets = lineOffsets || _rapierLineStartOffsets(source);
	const facts = [];
	const headingSlugs = Object.create(null);
	const seenLinkDefinitions = Object.create(null);
	const headingText = inline => {
		if (!inline || inline.type !== 'inline') return '';
		const children = Array.isArray(inline.children) ? inline.children : [];
		if (!children.length) return String(inline.content || '').trim();
		let text = '';
		for (const child of children) {
			if (!child) continue;
			if (child.type === 'softbreak' || child.type === 'hardbreak') text += ' ';
			else if (child.type === 'html_inline') text += String(child.content || '').replace(/<[^>]*>/g, '');
			else if (child.type === 'image') text += String(child.content || '');
			else if (child.type === 'text' || child.type === 'code_inline' || child.type === 'emoji' || child.type === 'math_inline') text += String(child.content || '');
		}
		return text.trim();
	};
	const makeSlug = value => {
		const base = typeof slugBase === 'function'
			? slugBase(value)
			: _rapierHeadingSlugBase(value);
		return _rapierNextHeadingSlug(base, headingSlugs);
	};
	for (let index = 0; index < (tokens || []).length; index++) {
		const token = tokens[index];
		if (!token || !token.map || (token.type !== 'heading_open' &&
				token.type !== 'reference_definition' && token.type !== 'fence')) continue;
		const span = _rapierSourceLineSpan(source, offsets, token.map[0], token.map[1]);
		if (token.type === 'heading_open') {
			const inline = tokens[index + 1];
			const label = headingText(inline);
			facts.push({
				kind: 'heading', normalizedKey: makeSlug(label),
				sourceStart: span.start, sourceEnd: span.end,
				label: label.slice(0, 240),
				evidence: {
					token: 'heading_open', markup: String(token.markup || ''),
					level: Number(String(token.tag || '').slice(1)) || 0,
					blockLevel: Number(token.level) || 0,
				},
			});
			continue;
		}
		if (token.type === 'reference_definition') {
			const normalizedKey = String(token.meta && token.meta.label || '');
			if (normalizedKey) {
				const occurrence = seenLinkDefinitions[normalizedKey] || 0;
				seenLinkDefinitions[normalizedKey] = occurrence + 1;
				const definition = token.meta.mdImageDefinition;
				facts.push({
					kind: 'link-definition', normalizedKey,
					sourceStart: span.start, sourceEnd: span.end,
					label: normalizedKey.slice(0, 240),
					evidence: {
						token: 'reference_definition', mapped: true, occurrence,
						href: definition ? String(definition.href || '') : null,
						title: definition && definition.title != null ? String(definition.title) : null,
					},
				});
			}
			continue;
		}
		if (token.type !== 'fence') continue;
		const marker = String(token.markup || '');
		const markerChar = marker.charAt(0);
		const minimumLength = marker.length;
		const raw = source.slice(span.start, span.end);
		const closed = token.meta?.rapierFenceClosed === true;
		const language = String(token.info || '').trim().split(/\s+/)[0].toLowerCase();
		const openingLine = raw.split(/\r\n?|\n/, 1)[0] || '';
		const markerOffset = marker ? openingLine.indexOf(marker) : -1;
		facts.push({
			kind: 'fence', normalizedKey: null,
			sourceStart: span.start, sourceEnd: span.end,
			label: marker.slice(0, 32),
			evidence: {
				token: 'fence', markup: marker, markerChar, minimumLength, closed, language,
				openingStart: markerOffset >= 0 ? span.start + markerOffset : span.start,
				openingEnd: markerOffset >= 0 ? span.start + markerOffset + marker.length : span.start + marker.length,
			},
		});
	}

	const footnoteDefinitions = env && Array.isArray(env.__rapierFootnoteDefinitions) ? env.__rapierFootnoteDefinitions : [];
	for (let occurrence = 0; occurrence < footnoteDefinitions.length; occurrence++) {
		const definition = footnoteDefinitions[occurrence];
		const span = _rapierSourceLineSpan(
			source, offsets, Number(definition.startLine), Number(definition.endLine));
		const label = String(definition.label || '');
		if (!label || span.end < span.start) continue;
		facts.push({
			kind: 'footnote-definition', normalizedKey: label,
			sourceStart: span.start, sourceEnd: span.end,
			label: label.slice(0, 240),
			evidence: { token: 'footnote_reference_open', occurrence, signature: String(definition.signature || '') },
		});
	}

	const candidates = env && Array.isArray(env.__rapierInlineCandidates) ? env.__rapierInlineCandidates : [];
	if (candidates.length) {
		const byInline = new Map();
		for (const candidate of candidates) {
			const key = Number(candidate.inlineId || 0);
			if (!key) continue;
			if (!byInline.has(key)) byInline.set(key, []);
			byInline.get(key).push(candidate);
		}
		for (const token of tokens || []) {
			if (!token || token.type !== 'inline' || !token.map || !token.children) continue;
			const taggedChild = token.children.find(child => child && child._rapierInlineProbeId);
			const inlineId = Number(token.children._rapierInlineProbeId || (taggedChild && taggedChild._rapierInlineProbeId) || 0);
			const localFacts = byInline.get(inlineId) || [];
			const abbreviationUses = [];
			for (let childIndex = 0; childIndex + 2 < token.children.length; childIndex++) {
				if (token.children[childIndex].type !== 'abbr_open' || token.children[childIndex + 1].type !== 'text' || token.children[childIndex + 2].type !== 'abbr_close') continue;
				const term = String(token.children[childIndex + 1].content || '');
				if (term) abbreviationUses.push(term);
			}
			if (!localFacts.length && !abbreviationUses.length) continue;
			const span = _rapierSourceLineSpan(source, offsets, token.map[0], token.map[1]);
			const mappedSource = source.slice(span.start, span.end);
			const inlineSource = String(token.content || '');
			const normalizedSource = mappedSource.replace(/\r\n?/g, '\n');
			const relative = normalizedSource.indexOf(inlineSource);
			if (relative < 0 || normalizedSource.indexOf(inlineSource, relative + 1) >= 0) continue;
			const inlineOffsets = normalizedSource.length === mappedSource.length ? null : _rapierLineStartOffsets(normalizedSource);
			const sourceOffset = local => {
				const position = relative + local;
				if (!inlineOffsets) return span.start + position;
				let low = 0, high = inlineOffsets.length - 1;
				while (low <= high) {
					const middle = (low + high) >> 1;
					if (inlineOffsets[middle] <= position) low = middle + 1;
					else high = middle - 1;
				}
				return offsets[token.map[0] + high] + position - inlineOffsets[high];
			};
			for (const candidate of localFacts) {
				const localStart = Number(candidate.localStart);
				const localEnd = Number(candidate.localEnd);
				if (!Number.isFinite(localStart) || !Number.isFinite(localEnd) || localStart < 0 || localEnd < localStart || localEnd > inlineSource.length) continue;
				const rawKey = String(candidate.rawKey || '');
				const normalizedKey = candidate.kind === 'footnote-use' || candidate.kind === 'local-link-use'
					? rawKey
					: (typeof normalizeReference === 'function'
							? normalizeReference(rawKey)
							: rawKey.trim().replace(/\s+/g, ' ').toUpperCase());
				facts.push({
					kind: candidate.kind, normalizedKey,
					sourceStart: sourceOffset(localStart), sourceEnd: sourceOffset(localEnd),
					label: String(candidate.label || rawKey).slice(0, 240),
					evidence: { ...(candidate.evidence || {}), token: 'inline' },
				});
			}
			for (const term of abbreviationUses) {
				const localStart = inlineSource.indexOf(term);
				if (localStart < 0 || inlineSource.indexOf(term, localStart + term.length) >= 0) continue;
				facts.push({
					kind: 'abbreviation-use', normalizedKey: term,
					sourceStart: sourceOffset(localStart), sourceEnd: sourceOffset(localStart + term.length),
					label: term.slice(0, 240), evidence: { token: 'abbr_open', exact: 'unique-inline-occurrence' },
				});
			}
		}
	}
	return facts;
}

function _rapierAttachFactsToParsedBlocks(blocks, facts) {
	if (!Array.isArray(blocks)) return blocks;
	blocks._rapierFacts = Array.isArray(facts) ? facts.slice() : [];
	if (!Array.isArray(facts) || !facts.length) return blocks;
	const ordered = blocks
		.map((block, index) => ({ block, index }))
		.sort((a, b) => Number(a.block._sourceStart) - Number(b.block._sourceStart));
	for (const fact of facts) {
		const start = Number(fact && fact.sourceStart);
		const end = Number(fact && fact.sourceEnd);
		if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
		let low = 0;
		let high = ordered.length - 1;
		let candidate = -1;
		while (low <= high) {
			const middle = (low + high) >> 1;
			if (Number(ordered[middle].block._sourceStart) <= start) {
				candidate = middle;
				low = middle + 1;
			} else {
				high = middle - 1;
			}
		}
		const owner = candidate >= 0 ? ordered[candidate].block : null;
		if (!owner || end > Number(owner._sourceEnd)) continue;
		if (!Array.isArray(owner._rapierFacts)) owner._rapierFacts = [];
		owner._rapierFacts.push(fact);
	}
	return blocks;
}

function _splitByTokenStream(markdown, parser, env = {}, preTokens = null) {
	const tokens = preTokens || parser.parse(markdown, env);
	const inlineCandidates = tokens.reduce((total, token) =>
		total + (Array.isArray(token.children) ? token.children.length : 0), 0);
	const offsets = _rapierLineStartOffsets(markdown);
	const tokenFacts = _rapierCollectTokenFacts(markdown, tokens, _rapierHeadingSlugBase, parser.utils.normalizeReference, env, offsets);
	const blocks = [];

	for (let i = 0; i < tokens.length; i++) {
		const tok = tokens[i];
		if (tok.level !== 0)    continue;
		if (tok.nesting === -1) continue;
		if (!tok.map)           continue;

		const [start, end] = tok.map;
		const span = _rapierSourceLineSpan(markdown, offsets, start, end);
		const raw = markdown.slice(span.start, span.end);
		if (!raw) continue;

		blocks.push({
			id:       blocks.length,
			type:     tok.type === 'reference_definition' ? 'link_reference' : tok.type.replace(/_open$/, ''),
			raw,
			_sourceStart: span.start,
			_sourceEnd: span.end,
			rendered: null,
			dirty:    false,
		});

		if (tok.nesting === 1) {
			let depth = 1;
			while (++i < tokens.length) {
				if (tokens[i].level === 0 && tokens[i].nesting === 1)  depth++;
				if (tokens[i].level === 0 && tokens[i].nesting === -1) depth--;
				if (depth === 0) break;
			}
		}
	}

	if (blocks.length === 0 && markdown.trim()) {
		return _splitByHeuristic(markdown);
	}
	const result = _rapierAttachFactsToParsedBlocks(blocks, tokenFacts);
	result._rapierProjectionMetrics = {
		blocks: result.length,
		tokens: tokens.length,
		inlineCandidates,
		nodes: tokens.length + inlineCandidates,
	};
	return result;
}

function _splitByHeuristic(markdown) {
	const source = String(markdown || '');
	const offsets = _rapierLineStartOffsets(source);
	const lineCount = offsets.length;
	const blocks = [];
	let startLine = null;
	let inFence = false;
	let fenceMark = '';
	let inMath = false;

	const lineText = index => {
		const span = _rapierSourceLineSpan(source, offsets, index, index + 1);
		return source.slice(span.start, span.end);
	};
	const flush = endLine => {
		if (startLine == null) return;
		const span = _rapierSourceLineSpan(source, offsets, startLine, endLine);
		if (span.end > span.start) {
			blocks.push({
				id: blocks.length,
				type: 'paragraph',
				raw: source.slice(span.start, span.end),
				_sourceStart: span.start,
				_sourceEnd: span.end,
				rendered: null,
				dirty: false,
			});
		}
		startLine = null;
	};

	for (let index = 0; index < lineCount; index++) {
		const line = lineText(index);
		const fence = /^(`{3,}|~{3,})/.exec(line);
		const mathFence = /^[ ]{0,3}\$\$\s*$/.test(line);
		if (startLine == null && line !== '') startLine = index;

		if (!inFence && !inMath && mathFence) {
			inMath = true;
		} else if (inMath) {
			if (mathFence && index !== startLine) {
				inMath = false;
				flush(index + 1);
			}
		} else if (!inFence && fence) {
			inFence = true;
			fenceMark = fence[1][0].repeat(fence[1].length);
		} else if (inFence && line.trimEnd() === fenceMark) {
			inFence = false;
			fenceMark = '';
			flush(index + 1);
		} else if (!inFence && line === '') {
			flush(index);
		}
	}
	flush(lineCount);
	return blocks;
}

function _rapierFinalizeParsedBlocks(blocks, markdown) {
	const source = String(markdown || '');
	const globalFacts = Array.isArray(blocks && blocks._rapierFacts) ? blocks._rapierFacts.slice() : [];
	let fallbackCursor = 0;
	const prepared = (blocks || []).map((block, index) => {
		const copy = { ...block };
		let start = Number(copy._sourceStart);
		let end = Number(copy._sourceEnd);
		if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
			const raw = String(copy.raw || '');
			start = source.indexOf(raw, fallbackCursor);
			if (start < 0) start = source.indexOf(raw);
			if (start < 0) start = source.length;
			end = Math.min(source.length, start + raw.length);
			fallbackCursor = Math.max(fallbackCursor, end);
		}
		copy._sourceStart = start;
		copy._sourceEnd = end;
		copy._parseOrder = index;
		return copy;
	}).sort((a, b) => a._sourceStart - b._sourceStart || a._parseOrder - b._parseOrder);

	const result = [];
	let cursor = 0;
	let firstStart = source.length;
	for (const block of prepared) {
		let start = Math.max(0, Math.min(source.length, Number(block._sourceStart)));
		let end = Math.max(start, Math.min(source.length, Number(block._sourceEnd)));
		if (end <= cursor) continue;
		if (start < cursor) start = cursor;
		if (result.length === 0) firstStart = start;
		const next = {
			...block,
			id: null,
			raw: source.slice(start, end),
			leading: result.length === 0 ? '' : source.slice(cursor, start),
			rendered: null,
			dirty: false,
			_rapierFactStart: start,
			_rapierFactEnd: end,
		};
		delete next._sourceStart;
		delete next._sourceEnd;
		delete next._parseOrder;
		result.push(next);
		cursor = end;
	}
	result._rapierPrefix = result.length ? source.slice(0, firstStart) : source;
	result._rapierTail = result.length ? source.slice(cursor) : '';

	for (let index = 0; index < result.length; index++) {
		const raw = String(result[index].raw || '');
		const match = /(?:\r\n?|\n)+$/.exec(raw);
		if (!match) continue;
		result[index].raw = raw.slice(0, -match[0].length);
		if (index + 1 < result.length) {
			result[index + 1].leading = match[0] + String(result[index + 1].leading || '');
		} else {
			result._rapierTail = match[0] + result._rapierTail;
		}
	}
	const semanticFacts = globalFacts
		.map(fact => ({ ...fact, ...(fact?.evidence ? { evidence: { ...fact.evidence } } : {}), blockId: null, spanIndex: -1 }))
		.sort((a, b) => Number(a.sourceStart) - Number(b.sourceStart) ||
			Number(a.sourceEnd) - Number(b.sourceEnd));
	let blockIndex = 0;
	semanticFacts.forEach(fact => {
		const factStart = Number(fact.sourceStart);
		const factEnd = Number(fact.sourceEnd);
		while (blockIndex < result.length - 1 &&
				factStart >= Number(result[blockIndex + 1]._rapierFactStart)) blockIndex++;
		const block = result[blockIndex];
		if (block && factStart >= Number(block._rapierFactStart) &&
				factEnd <= Number(block._rapierFactEnd)) fact.spanIndex = blockIndex;
	});
	result.forEach(block => {
		delete block._rapierFacts;
		delete block._rapierFactStart;
		delete block._rapierFactEnd;
	});
	const seenFacts = new Set();
	const uniqueFacts = semanticFacts.filter(fact => {
		const key = [fact.kind, fact.normalizedKey, fact.sourceStart, fact.sourceEnd].join('|');
		if (seenFacts.has(key)) return false;
		seenFacts.add(key);
		return true;
	});
	result._rapierFacts = uniqueFacts;
	return result;
}

function _rapierBuildSemanticFactIndex(facts) {
	const byKind = new Map();
	const definitions = {
		link: new Map(),
		footnote: new Map(),
		abbreviation: new Map(),
	};
	const uses = [];
	const definitionFamily = new Map([
		['link-definition', 'link'],
		['footnote-definition', 'footnote'],
		['abbreviation-definition', 'abbreviation'],
	]);
	const useKinds = new Set(['link-reference-use', 'image-reference-use', 'footnote-use', 'abbreviation-use']);
	for (const fact of Array.isArray(facts) ? facts : []) {
		if (!fact || !fact.kind) continue;
		if (!byKind.has(fact.kind)) byKind.set(fact.kind, []);
		byKind.get(fact.kind).push(fact);
		const family = definitionFamily.get(fact.kind);
		if (family) {
			const key = String(fact.normalizedKey == null ? '' : fact.normalizedKey);
			if (!definitions[family].has(key)) definitions[family].set(key, []);
			definitions[family].get(key).push(fact);
		}
		if (useKinds.has(fact.kind)) uses.push(fact);
	}
	const sortFacts = list => list.sort((a, b) => Number(a.sourceStart) - Number(b.sourceStart) || Number(a.sourceEnd) - Number(b.sourceEnd));
	byKind.forEach(sortFacts);
	Object.values(definitions).forEach(map => map.forEach(sortFacts));
	sortFacts(uses);
	let maxUseEnd = 0;
	const useMaxEnds = uses.map(use => maxUseEnd = Math.max(maxUseEnd, Number(use.sourceEnd)));
	return Object.freeze({ byKind, definitions: Object.freeze(definitions), uses: Object.freeze(uses), useMaxEnds: Object.freeze(useMaxEnds) });
}

export { _rapierBuildSemanticFactIndex, _rapierLineStartOffsets, _rapierSourceLineSpan, _rapierHeadingSlugBase, _rapierNextHeadingSlug, _rapierCollectTokenFacts, _rapierAttachFactsToParsedBlocks, _splitByTokenStream, _splitByHeuristic, _rapierFinalizeParsedBlocks };
