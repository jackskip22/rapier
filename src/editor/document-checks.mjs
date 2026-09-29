// SPDX-License-Identifier: AGPL-3.0-only

function _rapierBuildDocumentIssues(facts, sourceText, lineStarts) {
	const source = String(sourceText == null ? '' : sourceText);
	const rows = Array.isArray(facts) ? facts : [];
	const issues = [];
	const grouped = kind => {
		const map = new Map();
		rows.filter(fact => fact && fact.kind === kind).forEach(fact => {
			const key = String(fact.normalizedKey == null ? '' : fact.normalizedKey);
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(fact);
		});
		map.forEach(list => list.sort((a, b) => Number(a.sourceStart) - Number(b.sourceStart)));
		return map;
	};
	const lineAt = offset => {
		const position = Math.max(0, Number(offset) || 0);
		let low = 0, high = lineStarts.length - 1;
		while (low <= high) {
			const middle = (low + high) >> 1;
			if (lineStarts[middle] <= position) low = middle + 1;
			else high = middle - 1;
		}
		return high + 1;
	};
	const add = (kind, fact, message, action, targetStart, targetEnd, extra = null) => {
		const start = Number.isFinite(Number(targetStart)) ? Number(targetStart) : Number(fact.sourceStart);
		const end = Number.isFinite(Number(targetEnd)) ? Number(targetEnd) : Number(fact.sourceEnd);
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > source.length) return;
		const key = String(fact.normalizedKey == null ? '' : fact.normalizedKey);
		issues.push({
			id: [kind, start, end, key].join(':'), kind, normalizedKey: key,
			label: String(fact.label || key).slice(0, 240), message,
			location: 'line ' + lineAt(start), action: action || null,
			sourceStart: Number(fact.sourceStart), sourceEnd: Number(fact.sourceEnd),
			targetStart: start, targetEnd: end, expectedText: source.slice(start, end),
			evidence: { ...(fact.evidence || {}), ...(extra || {}) },
		});
	};

	const footnoteDefinitions = grouped('footnote-definition');
	for (const use of rows.filter(fact => fact && fact.kind === 'footnote-use')) {
		const key = String(use.normalizedKey || '');
		if (!key || footnoteDefinitions.has(key)) continue;
		add('missing-footnote-definition', use,
			'Footnote [^' + key + '] has no definition.', 'add-note');
	}
	footnoteDefinitions.forEach((definitions, key) => {
		if (definitions.length < 2) return;
		const winner = definitions[definitions.length - 1];
		const winnerSignature = String(winner.evidence && winner.evidence.signature || '');
		if (!winnerSignature) return;
		definitions.slice(0, -1).forEach(definition => {
			const signature = String(definition.evidence && definition.evidence.signature || '');
			if (!signature || signature === winnerSignature) return;
			add('conflicting-footnote-definition', definition,
				'An earlier footnote definition for [^' + key + '] is overridden by a different later definition.', null);
		});
	});

	const linkDefinitions = grouped('link-definition');
	for (const use of rows.filter(fact => fact && (fact.kind === 'link-reference-use' || fact.kind === 'image-reference-use'))) {
		const key = String(use.normalizedKey || '');
		if (!key || linkDefinitions.has(key)) continue;
		add('missing-link-definition', use,
			(use.kind === 'image-reference-use' ? 'Image reference ' : 'Reference ') + '[' + String(use.label || key) + '] has no definition.',
			'add-destination', undefined, undefined,
			{ rawLabel: String(use.label || '').slice(0, 240) });
	}
	linkDefinitions.forEach((definitions, key) => {
		if (definitions.length < 2) return;
		const winner = definitions[0];
		const href = winner.evidence && winner.evidence.href;
		if (href == null) return;
		const title = winner.evidence && winner.evidence.title;
		definitions.slice(1).forEach(definition => {
			const laterHref = definition.evidence && definition.evidence.href;
			if (laterHref == null) return;
			const laterTitle = definition.evidence && definition.evidence.title;
			if (String(laterHref) === String(href) && String(laterTitle == null ? '' : laterTitle) === String(title == null ? '' : title)) return;
			add('conflicting-link-definition', definition,
				'A later definition for [' + key + '] cannot override the earlier destination.', null);
		});
	});

	const headings = new Set(rows.filter(fact => fact && fact.kind === 'heading').map(fact => String(fact.normalizedKey || '')));
	for (const use of rows.filter(fact => fact && fact.kind === 'local-link-use')) {
		let key = String(use.normalizedKey || '');
		try { key = decodeURIComponent(key); } catch (_) {}
		if (!key || headings.has(key)) continue;
		add('missing-local-heading', use,
			'Local link #' + key + ' names no heading in this document.', 'choose-heading');
	}

	for (const fence of rows.filter(fact => fact && fact.kind === 'fence' && !(fact.evidence && fact.evidence.closed))) {
		const start = Number(fence.evidence && fence.evidence.openingStart);
		const end = Number(fence.evidence && fence.evidence.openingEnd);
		const marker = String(fence.evidence && fence.evidence.markup || fence.label || '```');
		add('unclosed-fence', fence, 'Fenced code block opened here has no closing fence.', 'close-fence', start, end,
			{ closingMarker: marker.charAt(0).repeat(Math.max(3, Number(fence.evidence && fence.evidence.minimumLength) || marker.length || 3)) });
	}

	issues.sort((a, b) => a.targetStart - b.targetStart || a.targetEnd - b.targetEnd || a.kind.localeCompare(b.kind));
	return issues;
}

export { _rapierBuildDocumentIssues };
