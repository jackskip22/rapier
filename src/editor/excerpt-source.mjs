// SPDX-License-Identifier: AGPL-3.0-only
import { _rapierBuildSemanticFactIndex } from './source-facts.mjs';

function _rapierExcerptUsesOverlapping(index, start, end) {
	const uses = index && Array.isArray(index.uses) ? index.uses : [];
	if (!uses.length || end <= start) return [];
	let low = 0, high = uses.length;
	while (low < high) {
		const mid = (low + high) >> 1;
		if (index.useMaxEnds[mid] <= start) low = mid + 1;
		else high = mid;
	}
	const found = [];
	for (let i = low; i < uses.length && Number(uses[i].sourceStart) < end; i++) {
		if (Number(uses[i].sourceEnd) > start) found.push(uses[i]);
	}
	return found;
}

function _rapierExcerptDefinitionForUse(use, index) {
	if (!use || !index) return null;
	const key = String(use.normalizedKey == null ? '' : use.normalizedKey);
	if (!key) return null;
	let list = null;
	if (use.kind === 'footnote-use') list = index.definitions.footnote.get(key);
	else if (use.kind === 'abbreviation-use') list = index.definitions.abbreviation.get(key);
	else if (use.kind === 'link-reference-use' || use.kind === 'image-reference-use') list = index.definitions.link.get(key);
	if (!list || !list.length) return null;
	return use.kind === 'footnote-use' ? list[list.length - 1] : list[0];
}

function _rapierPlanCompleteExcerpt(exact, facts, factIndex = null) {
	if (!exact) return null;
	const start = Number(exact.start), end = Number(exact.end), limit = Number(exact.canonicalLength);
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(limit) || start < 0 || end <= start || end > limit) return null;
	const index = factIndex || _rapierBuildSemanticFactIndex(facts);
	if (!index) return null;
	const overlaps = (fact, lo, hi) => Number(fact.sourceStart) < hi && Number(fact.sourceEnd) > lo;
	const contained = (fact, lo, hi) => Number(fact.sourceStart) >= lo && Number(fact.sourceEnd) <= hi;
	const queue = [];
	for (const use of _rapierExcerptUsesOverlapping(index, start, end)) {
		if (!contained(use, start, end)) return null;
		queue.push(use);
	}
	if (!queue.length) return null;

	const required = new Map();
	const visited = new Set();
	for (const use of queue) {
		const useId = [use.kind, use.normalizedKey, use.sourceStart, use.sourceEnd].join('|');
		if (visited.has(useId)) continue;
		visited.add(useId);
		const definition = _rapierExcerptDefinitionForUse(use, index);
		if (!definition) return null;
		const ds = Number(definition.sourceStart), de = Number(definition.sourceEnd);
		if (!Number.isSafeInteger(ds) || !Number.isSafeInteger(de) || ds < 0 || de <= ds || de > limit) return null;
		if (overlaps(definition, start, end) && !contained(definition, start, end)) return null;
		const defId = [definition.kind, definition.normalizedKey, ds, de].join('|');
		if (required.has(defId)) continue;
		required.set(defId, definition);
		for (const nested of _rapierExcerptUsesOverlapping(index, ds, de)) {
			if (!contained(nested, ds, de)) return null;
			queue.push(nested);
		}
	}
	const definitions = Array.from(required.values())
		.filter(definition => !contained(definition, start, end))
		.sort((a, b) => Number(a.sourceStart) - Number(b.sourceStart) || Number(a.sourceEnd) - Number(b.sourceEnd));
	return definitions.length ? Object.freeze({ definitions: Object.freeze(definitions) }) : null;
}

function _rapierExcerptPlanKey(plan) {
	return plan ? plan.definitions.map(definition => [definition.kind, definition.normalizedKey, definition.sourceStart, definition.sourceEnd].join(':')).join('|') : '';
}

function _rapierExcerptCleanSeparator(text, newline) {
	const value = String(text || '');
	if (value.endsWith(newline + newline)) return '';
	if (value.endsWith(newline)) return newline;
	return newline + newline;
}

function _rapierMaterializeCompleteExcerpt(exact, plan, sourceText) {
	if (!exact || !plan) return null;
	const source = String(sourceText == null ? '' : sourceText);
	if (source.length !== Number(exact.canonicalLength)) return null;
	let excerpt = source.slice(Number(exact.start), Number(exact.end));
	if (!excerpt) return null;
	const selected = excerpt;
	const firstNewline = /\r\n?|\n/.exec(source);
	const newline = firstNewline ? firstNewline[0] : '\n';
	for (const definition of plan.definitions) {
		const start = Number(definition.sourceStart), end = Number(definition.sourceEnd);
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > source.length) return null;
		const raw = source.slice(start, end);
		excerpt += _rapierExcerptCleanSeparator(excerpt, newline) + raw;
	}
	return Object.freeze({ selected, excerpt, newline, definitions: plan.definitions });
}

export { _rapierExcerptUsesOverlapping, _rapierExcerptDefinitionForUse, _rapierPlanCompleteExcerpt, _rapierExcerptPlanKey, _rapierExcerptCleanSeparator, _rapierMaterializeCompleteExcerpt };
