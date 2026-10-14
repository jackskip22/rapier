// SPDX-License-Identifier: MIT
// Exact source projection shared by canonical history and causal transport.
// Callers admit and order the records first; this projection retains no state.
import {_rapierTransformSplices, _rapierHistoryEffects} from './journal-records.mjs';
import {diff} from './diff.mjs';

const historyFailure = reason => ({ok: false, reason});
const historyBoundary = (source, at) => Number.isSafeInteger(at) && at >= 0 && !Object.is(at, -0) && at <= source.length &&
	!(at > 0 && at < source.length && (source.charCodeAt(at - 1) & 0xFC00) === 0xD800 &&
	(source.charCodeAt(at) & 0xFC00) === 0xDC00);

// Persistent AVL pieces retain original strings and coordinates. A revision costs
// only the edited paths; reading a range visits its leaves, never earlier bodies.
const sourceLeaf = (text, from = 0, to = text.length) => to > from
	? {text, from, length: to - from, height: 1} : null;
const sourceHeight = node => node?.height || 0;
const sourceNode = (left, right) => !left ? right : !right ? left
	: {left, right, length: left.length + right.length, height: 1 + Math.max(left.height, right.height)};
function sourceBalance(left, right) {
	if (sourceHeight(left) > sourceHeight(right) + 1) {
		if (sourceHeight(left.left) >= sourceHeight(left.right)) return sourceNode(left.left, sourceNode(left.right, right));
		return sourceNode(sourceNode(left.left, left.right.left), sourceNode(left.right.right, right));
	}
	if (sourceHeight(right) > sourceHeight(left) + 1) {
		if (sourceHeight(right.right) >= sourceHeight(right.left)) return sourceNode(sourceNode(left, right.left), right.right);
		return sourceNode(sourceNode(left, right.left.left), sourceNode(right.left.right, right.right));
	}
	return sourceNode(left, right);
}
function sourceJoin(left, right) {
	if (!left || !right) return left || right;
	if (left.height > right.height + 1) return sourceBalance(left.left, sourceJoin(left.right, right));
	if (right.height > left.height + 1) return sourceBalance(sourceJoin(left, right.left), right.right);
	return sourceNode(left, right);
}
function sourceSplit(node, at) {
	if (!node || at === 0) return [null, node];
	if (at === node.length) return [node, null];
	if (node.text !== undefined) return [sourceLeaf(node.text, node.from, node.from + at), sourceLeaf(node.text, node.from + at, node.from + node.length)];
	if (at < node.left.length) {
		const [left, right] = sourceSplit(node.left, at);
		return [left, sourceJoin(right, node.right)];
	}
	const [left, right] = sourceSplit(node.right, at - node.left.length);
	return [sourceJoin(node.left, left), right];
}
function* sourceParts(node, from, to) {
	if (!node || from >= to) return;
	if (node.text !== undefined) {
		yield node.from + from === 0 && node.from + to === node.text.length ? node.text : node.text.slice(node.from + from, node.from + to); return;
	}
	if (from < node.left.length) yield* sourceParts(node.left, from, Math.min(to, node.left.length));
	if (to > node.left.length) yield* sourceParts(node.right, Math.max(0, from - node.left.length), to - node.left.length);
}
function* sourceLeaves(node) {
	if (!node) return;
	if (node.text !== undefined) { yield node; return; }
	yield* sourceLeaves(node.left); yield* sourceLeaves(node.right);
}
export class HistorySource {
	#root;
	constructor(text, root = sourceLeaf(text)) { this.#root = root; }
	static fromParts(parts) {
		const leaves = Array.from(parts, text => sourceLeaf(text)).filter(Boolean);
		const build = (from, to) => from === to ? null : to - from === 1 ? leaves[from]
			: sourceNode(build(from, Math.floor((from + to) / 2)), build(Math.floor((from + to) / 2), to));
		return new HistorySource('', build(0, leaves.length));
	}
	get length() { return this.#root?.length || 0; }
	charCodeAt(at) {
		if (at < 0 || at >= this.length) return NaN;
		let node = this.#root;
		while (node.text === undefined) {
			if (at < node.left.length) node = node.left;
			else { at -= node.left.length; node = node.right; }
		}
		return node.text.charCodeAt(node.from + at);
	}
	parts(from = 0, to = this.length) { return sourceParts(this.#root, from, to); }
	slice(from = 0, to = this.length) {
		const root = this.#root;
		if (!root || from >= to) return '';
		if (root.text !== undefined) return root.from + from === 0 && root.from + to === root.text.length
			? root.text : root.text.slice(root.from + from, root.from + to);
		return Array.from(this.parts(from, to)).join('');
	}
	matches(from, text) {
		if (from < 0 || from + text.length > this.length) return false;
		let at = 0;
		for (const part of this.parts(from, from + text.length)) {
			if (!text.startsWith(part, at)) return false;
			at += part.length;
		}
		return at === text.length;
	}
	sameParts(parts) {
		const leaves = sourceLeaves(this.#root);
		let leaf = leaves.next().value, offset = 0;
		for (const text of parts) for (let at = 0; at < text.length;) {
			if (!leaf) return false;
			const length = Math.min(leaf.length - offset, text.length - at), from = leaf.from + offset;
			// Untouched runs share their string and coordinates. Only changed fragments
			// require a text comparison; no full-body join is needed to prove the plan.
			if ((leaf.text !== text || from !== at) && leaf.text.slice(from, from + length) !== text.slice(at, at + length)) return false;
			offset += length; at += length;
			if (offset === leaf.length) { leaf = leaves.next().value; offset = 0; }
		}
		return !leaf;
	}
	replace(pos, length, text) {
		const [left, rest] = sourceSplit(this.#root, pos), [, right] = sourceSplit(rest, length);
		return new HistorySource('', sourceJoin(sourceJoin(left, sourceLeaf(text)), right));
	}
	// Undoing an admitted repair is observation: its after-state can join a scalar
	// across the deleted run. Prove the forward boundaries on the reconstructed view.
	before(splices) {
		let source = this;
		for (let index = splices.length - 1; index >= 0; index--) {
			const row = splices[index];
			if (!row || !Number.isSafeInteger(row.pos) || row.pos < 0 || Object.is(row.pos, -0) ||
				typeof row.removed !== 'string' || typeof row.inserted !== 'string' ||
				/[\uD800-\uDFFF]/u.test(row.removed) || /[\uD800-\uDFFF]/u.test(row.inserted) || !source.matches(row.pos, row.inserted)) return null;
			source = source.replace(row.pos, row.inserted.length, row.removed);
			if (!historyBoundary(source, row.pos) || !historyBoundary(source, row.pos + row.removed.length)) return null;
		}
		return source;
	}
	apply(splices, inverse = false) {
		if (!Array.isArray(splices)) return null;
		let source = this;
		for (let index = 0; index < splices.length; index++) {
			const row = splices[inverse ? splices.length - 1 - index : index];
			const removed = inverse ? row?.inserted : row?.removed, inserted = inverse ? row?.removed : row?.inserted;
			if (typeof removed !== 'string' || typeof inserted !== 'string' ||
				/[\uD800-\uDFFF]/u.test(removed) || /[\uD800-\uDFFF]/u.test(inserted) ||
				!historyBoundary(source, row.pos) || !historyBoundary(source, row.pos + removed.length) || !source.matches(row.pos, removed)) return null;
			source = source.replace(row.pos, removed.length, inserted);
		}
		return source;
	}
}

function minimalHistorySplice(before, after, pos = 0) {
	let first = 0, a = before.length, b = after.length;
	while (first < a && first < b && before[first] === after[first]) first++;
	if (!historyBoundary(before, first) || !historyBoundary(after, first)) first--;
	while (a > first && b > first && before[a - 1] === after[b - 1]) { a--; b--; }
	if (!historyBoundary(before, a) || !historyBoundary(after, b)) { a++; b++; }
	return {pos: pos + first, removed: before.slice(first, a), inserted: after.slice(first, b)};
}

// Split recorded replacements only at exact unchanged word or line tokens.
// Shared letters inside changed words do not establish surviving ownership.
function historyHunks(row) {
	if (row.removed === row.inserted) return [];
	if (!row.removed || !row.inserted) return [{...row}];
	const size = row.removed.length + row.inserted.length;
	const edits = size <= 1024 * 1024 ? diff(row.removed, row.inserted,
		{_unit: size <= 16384 ? 'word' : 'line', limit: 1000000}).edits : null;
	if (!edits || edits.length > 64 || edits.some(edit => edit.coarse))
		return [minimalHistorySplice(row.removed, row.inserted, row.pos)];
	return edits.map(edit => ({pos: row.pos + edit.before[0], removed: row.removed.slice(...edit.before),
		inserted: row.inserted.slice(...edit.after)})).reverse();
}


// Rows are already proved source placements, optionally carrying sourceIndices from
// causal projection. Multiple inverse blockers can change history with no source edit.
export function projectInverseSource(prepared, selected, projectedEffects, options = {}) {
	const records = prepared.records || prepared.rows.map(({record, splices}) => record.splices === splices ? record : {...record, splices});
	if (!records.some(record => !prepared.effects.references.get(record.transaction.id)?.length &&
		prepared.effects.active.has(record.transaction.id) !== projectedEffects.active.has(record.transaction.id)))
		return {ok: true, splices: [], after: prepared.source, superseded: [], overlaps: []};
	try {
		let pieces = prepared.initialSource ? [{text: prepared.initialSource, owner: null, lineage: []}] : [];
		const all = [], byId = new Map(), byAct = new Map(), processed = [], keptInverseAncestors = new Set();
		const texts = rows => rows.map(row => row.text || '');
		const textOf = rows => texts(rows).join('');
		const lengthOf = (rows, to = rows.length) => { let size = 0; for (let i = 0; i < to; i++) size += rows[i].text?.length || 0; return size; };
		const sourceOf = rows => HistorySource.fromParts(texts(rows));
		const replays = (before, after, splices) => sourceOf(before).apply(splices)?.sameParts(texts(after)) === true;
		const boundary = pos => {
			let offset = 0;
			for (let index = 0; index < pieces.length; index++) {
				const row = pieces[index];
				if (!row.text) continue;
				const end = offset + row.text.length;
				if (pos > offset && pos < end) {
					const at = pos - offset;
					pieces.splice(index, 1, {...row, text: row.text.slice(0, at)}, {...row, text: row.text.slice(at)});
				break;
				}
				offset = end;
			}
			offset = 0;
			let first = pieces.length, last = pieces.length;
			for (let index = 0; index < pieces.length; index++) {
				if (offset === pos) { first = index; last = index; while (last < pieces.length && !pieces[last].text) last++; return {first, last}; }
				offset += pieces[index].text?.length || 0;
			}
			if (offset !== pos) throw Error('range');
			return {first, last};
		};
		const owns = (piece, hunk) => piece === hunk.marker || piece.owner === hunk.id ||
			piece.restoredBy?.includes(hunk.id) || hunk.restoredMarkers?.has(piece);
		const effectiveBefore = (hunk, effects) => {
			const active = new Set([hunk.id]), pending = [{hunk, at: 0, parts: []}];
			while (pending.length) {
				const frame = pending[pending.length - 1];
				if (frame.at === frame.hunk.before.length) {
					const text = frame.parts.join(''); pending.pop(); active.delete(frame.hunk.id);
					if (!pending.length) return text;
					pending[pending.length - 1].parts.push(text); continue;
				}
				const piece = frame.hunk.before[frame.at++];
				if (!piece.text) continue;
				const owner = byId.get(piece.owner);
				if (owner && !effects.active.has(owner.actId) && !owner.kept) {
					if (piece.text !== owner.inserted || active.has(owner.id)) return null;
					active.add(owner.id); pending.push({hunk: owner, at: 0, parts: []});
				} else frame.parts.push(piece.text);
			}
			return null;
		};
		const restoreHunk = hunk => {
			if (!pieces.includes(hunk.marker)) throw Error('reactivation');
			for (let at = pieces.length - 1; at >= 0; at--)
				if (pieces[at] !== hunk.marker && owns(pieces[at], hunk)) pieces.splice(at, 1);
			pieces.splice(pieces.indexOf(hunk.marker), 1, ...hunk.before);
			for (const piece of hunk.before) if (piece.mark) { piece.mark.active = true; delete piece.mark.undoneBy; }
		};
		const laterSource = (hunk, effects) => [...hunk.supersededBy].some(id => {
			const next = byId.get(id);
			return next && effects.active.has(next.actId) && !prepared.effects.references.get(next.actId)?.length;
		});
		const reactivate = (actIds, effects) => {
			for (const hunk of all) {
				if (!actIds.has(hunk.actId) || hunk.derived || prepared.effects.references.get(hunk.actId)?.length) continue;
				if (keptInverseAncestors.has(hunk.id)) continue;
				if (laterSource(hunk, effects) || pieces.some(piece => piece.text && piece.owner === hunk.id) ||
					(!hunk.inserted && hunk.active)) continue;
				const marker = pieces.indexOf(hunk.marker);
				if (marker < 0) {
					// A zero-row withdrawal can release source still carried by another
					// inverse's marker. Its exact ancestry also preserves later inserted runs.
					const inverse = all.findLast(prior => prior.reversedHunk === hunk.id && pieces.includes(prior.marker));
					if (!inverse) throw Error('reactivation');
					if (laterSource(inverse, effects)) continue;
					restoreHunk(inverse); inverse.active = false;
					hunk.active = true; delete hunk.undoneBy;
					continue;
				}
				const pos = lengthOf(pieces, marker);
				const removed = effectiveBefore(hunk, effects);
				if (removed === null || !sourceOf(pieces).matches(pos, removed)) throw Error('reactivation');
				boundary(pos + removed.length);
				const start = boundary(pos), end = boundary(pos + removed.length);
				const at = start.last, count = Math.max(0, end.first - at);
				if (textOf(pieces.slice(at, at + count)) !== removed) throw Error('reactivation');
				const replacedOwners = new Set(pieces.slice(at, at + count).map(piece => piece.owner).filter(Boolean));
				pieces.splice(at, count, ...(hunk.inserted ? [{text: hunk.inserted, owner: hunk.id, lineage: hunk.lineage.slice()}] : []));
				for (const owner of replacedOwners) if (owner !== hunk.id && !pieces.some(piece => piece.text && piece.owner === owner)) {
					const prior = byId.get(owner); if (prior) prior.active = false;
				}
				hunk.active = true; delete hunk.undoneBy;
			}
		};
		const pictureInsertions = new Map(records.filter(record => prepared.effects.pictures.has(record.transaction.id))
			.map(record => [prepared.effects.pictures.get(record.transaction.id), record.splices.map(row => row.removed)]));
		for (const {record, splices, sourceIndices} of prepared.rows) {
			const tx = record.transaction, references = new Set(prepared.effects.references.get(tx.id) || []);
			const actSource = options.keepHunk && selected.has(tx.id) ? textOf(pieces) : null;
			processed.push(record);
			const picture = prepared.effects.pictures.get(tx.id);
			if (picture) {
				// The new codec bytes keep the exact inserted run's ownership. Do not
				// cross a later edit, combine authors, or create another reversible act.
				for (const row of splices) {
					boundary(row.pos + row.removed.length);
					const start = boundary(row.pos), end = boundary(row.pos + row.removed.length);
					const removed = pieces.slice(start.last, end.first), owner = removed[0]?.owner, hunk = byId.get(owner);
					if (!hunk || hunk.actId !== picture || removed.some(piece => !piece.text || piece.owner !== owner) || textOf(removed) !== row.removed)
						throw Error('picture_ownership');
					const at = hunk.inserted.indexOf(row.removed);
					if (at < 0 || hunk.inserted.indexOf(row.removed, at + 1) >= 0) throw Error('picture_ownership');
					hunk.inserted = hunk.inserted.slice(0, at) + row.inserted + hunk.inserted.slice(at + row.removed.length);
					pieces.splice(start.last, end.first - start.last, {text: row.inserted, owner, lineage: hunk.lineage.slice()});
				}
				continue;
			}
			if (references.size) {
				// Exact inverse rows restore the previous run identities. Retain the inverse's
				// own transient marker too, so reversing it restores that same ancestry again.
				const targets = all.filter(hunk => hunk.active && references.has(hunk.actId));
				let restored = targets.length ? pieces.slice() : null;
				const inverses = [], priorSplices = options.keepHunk ? [] : null;
				for (let index = targets.length - 1; restored && index >= 0; index--) {
					const target = targets[index], first = restored.indexOf(target.marker);
					if (first < 0) { restored = null; break; }
					let last = first;
					for (let at = first; at < restored.length; at++) if (owns(restored[at], target)) last = at;
					const pos = lengthOf(restored, first);
					const before = restored.slice(first, last + 1), replacement = [];
					for (const piece of before) {
						if (piece === target.marker) replacement.push(...target.before);
						else if (!owns(piece, target)) replacement.push(piece);
					}
					const id = tx.id + '#inverse:' + index, lineage = new Set([id]);
					for (const piece of before) for (const parent of piece.lineage || piece.mark?.lineage || []) lineage.add(parent);
					const hunk = {id, actId: tx.id, removed: textOf(before), inserted: textOf(replacement), before, reversedHunk: target.id,
						chosen: selected.has(tx.id), lineage: [...lineage], supersededBy: new Set(), active: true,
						restoredMarkers: new Set(replacement.filter(piece => !piece.text))};
					if (hunk.chosen && options.keepHunk) {
						const spliceIndex = splices.findIndex(row => row.pos <= pos && row.pos + row.removed.length >= pos);
						const keep = options.keepHunk({actId: tx.id, spliceIndex: Math.max(0, spliceIndex), hunkIndex: index,
							splice: {pos, removed: hunk.removed, inserted: hunk.inserted}, beforeSource: textOf(restored), actSource, priorSplices});
						if (typeof keep !== 'boolean') throw Error('hunk_selection');
						hunk.chosen = !keep;
					}
					hunk.kept = selected.has(tx.id) && !hunk.chosen;
					// A semantic owner retaining this inverse also retains the exact ancestors
					// it restored; effect reactivation must not change them behind that owner.
					if (hunk.kept) for (let prior = target; prior; prior = byId.get(prior.reversedHunk)) keptInverseAncestors.add(prior.id);
					hunk.marker = {mark: hunk};
					const insertion = replacement.map(piece => piece.text ? {...piece,
						lineage: [...new Set([...(piece.lineage || []), id])],
						restoredBy: [...(piece.restoredBy || []), id]} : piece);
					restored.splice(first, last + 1 - first, hunk.marker, ...insertion);
					inverses.push(hunk); priorSplices?.push({pos, removed: hunk.removed, inserted: hunk.inserted});
				}
				if (restored && replays(pieces, restored, splices)) {
					pieces = restored;
					for (const target of targets) { target.active = false; target.undoneBy = tx.id; }
					for (const piece of pieces) if (piece.mark) {
						piece.mark.active = true; delete piece.mark.undoneBy;
					}
					for (const hunk of inverses) { all.push(hunk); byId.set(hunk.id, hunk); }
					byAct.set(tx.id, inverses);
					continue;
				}
			}

			if (references.size) {
				const previous = _rapierHistoryEffects(processed.slice(0, -1)), current = _rapierHistoryEffects(processed);
				const activated = new Set(current.effectiveActIds.filter(id => !previous.active.has(id) &&
					id !== tx.id && !current.references.get(id)?.length));
				if (activated.size) {
					const before = pieces, priorStates = all.map(hunk => [hunk, hunk.active, hunk.undoneBy]); pieces = pieces.slice();
					try {
						reactivate(activated, current);
						if (replays(before, pieces, splices)) continue;
					} catch (_) {}
					pieces = before;
					for (const [hunk, active, undoneBy] of priorStates) { hunk.active = active; hunk.undoneBy = undoneBy; }
				}
			}
			const priorSplices = options.keepHunk ? [] : null;
			// An admitted codec finish replaces the complete embedded definition/reference.
			// Keep its inserted run whole, including byte-identical prefixes of a re-edit;
			// the previous picture stays in `before` for Undo, not as mixed live ownership.
			const hunks = row => pictureInsertions.get(tx.id)?.some(text => row.inserted.includes(text)) ? [{...row}] : historyHunks(row);
			for (let rowIndex = 0; rowIndex < splices.length; rowIndex++) {
				const original = splices[rowIndex];
				let rows;
				if (options.splitSplice) {
					const beforeSource = textOf(pieces), parts = options.splitSplice({actId: tx.id, beforeSource, splice: original});
					// Semantic boundaries only refine this act's exact bytes, never its history.
					if (!Array.isArray(parts) || _rapierTransformSplices(beforeSource, parts) !== _rapierTransformSplices(beforeSource, [original]))
						throw Error('hunk_projection');
					rows = parts.flatMap(hunks);
				} else rows = hunks(original);
				for (let index = 0; index < rows.length; index++) {
					const row = rows[index];
					const derived = (sourceIndices?.[rowIndex] ?? rowIndex) === record.derivedCommentIndex;
					let chosen = selected.has(tx.id) && !derived;
					boundary(row.pos + row.removed.length);
					const start = boundary(row.pos), end = boundary(row.pos + row.removed.length);
					let at = start.last, count = Math.max(0, end.first - at);
					if (!row.removed.length) {
						// A new insertion at a replacement's left boundary stays before that replacement.
						const marker = pieces.slice(start.first, start.last).findIndex(item => item.mark?.inserted.length);
						at = marker < 0 ? start.last : start.first + marker; count = 0;
					}
					const removed = pieces.slice(at, at + count);
					if (textOf(removed) !== row.removed) throw Error('replay');
					// A semantic owner may retain a drawing hunk while prose in that same act undoes.
					// The predicate only selects transient hunks; every original row still replays.
					if (chosen && options.keepHunk) {
						const keep = options.keepHunk({actId: tx.id, spliceIndex: rowIndex, hunkIndex: index,
							splice: {pos: row.pos, removed: row.removed, inserted: row.inserted}, beforeSource: textOf(pieces), actSource, priorSplices});
						if (typeof keep !== 'boolean') throw Error('hunk_selection');
						chosen = !keep;
					}
					const id = tx.id + '#' + rowIndex + ':' + index;
					const lineage = new Set([id]);
					for (const piece of removed) for (const parent of piece.lineage || piece.mark?.lineage || []) lineage.add(parent);
					const hunk = {id, actId: tx.id, removed: row.removed, inserted: row.inserted, before: removed, derived,
						chosen, kept: selected.has(tx.id) && !chosen, lineage: [...lineage], supersededBy: new Set(), active: true};
					hunk.marker = {mark: hunk};
					all.push(hunk); byId.set(id, hunk);
					if (!byAct.has(tx.id)) byAct.set(tx.id, []);
					byAct.get(tx.id).push(hunk);
					for (const parent of lineage) {
						const earlier = byId.get(parent);
						if (earlier && earlier !== hunk) earlier.supersededBy.add(id);
					}
					pieces.splice(at, count, hunk.marker, ...(row.inserted ? [{text: row.inserted, owner: id, lineage: [...lineage]}] : []));
					priorSplices?.push({pos: row.pos, removed: row.removed, inserted: row.inserted});
				}
			}
		}
		if (!new HistorySource(prepared.source).sameParts(texts(pieces))) throw Error('head');
		const origins = new Map();
		let offset = 0;
		for (const piece of pieces) if (piece.text) { origins.set(piece, offset); offset += piece.text.length; }
		const superseded = [];
		for (let index = all.length - 1; index >= 0; index--) {
			const hunk = all[index];
			const inheritedInactive = !hunk.derived && !hunk.kept && !keptInverseAncestors.has(hunk.id) && !projectedEffects.active.has(hunk.actId) &&
				!prepared.effects.references.get(hunk.actId)?.length;
			if (!hunk.chosen && !inheritedInactive) continue;
			hunk.active = prepared.effects.active.has(hunk.actId);
			const laterActIds = [...new Set([...hunk.supersededBy].filter(id =>
				(byId.get(id)?.kept || byId.get(id)?.active && projectedEffects.active.has(byId.get(id)?.actId))).map(id => byId.get(id).actId))];
			const marker = pieces.indexOf(hunk.marker);
			if ((!hunk.active && !inheritedInactive) || laterActIds.length || marker < 0) {
				if (hunk.chosen) superseded.push({actId: hunk.actId, hunk: hunk.id, laterActIds: hunk.undoneBy ? [hunk.undoneBy] : laterActIds,
					reason: hunk.active ? 'later_edit' : 'already_undone'});
				continue;
			}
			// Restoring an inverse can restore a deletion marker without any owned text.
			restoreHunk(hunk);
		}
		// A hidden withdrawal can have no splice of its own. Reversing that withdrawal
		// reactivates the original hunk at its retained marker, never at a text search.
		reactivate(new Set(records.filter(record => !prepared.effects.active.has(record.transaction.id) &&
			projectedEffects.active.has(record.transaction.id)).map(record => record.transaction.id)), projectedEffects);
		const after = textOf(pieces), changes = [];
		let cursor = 0, inserted = '';
		for (const piece of pieces) {
			if (!piece.text) continue;
			const origin = origins.get(piece);
			if (origin == null) { inserted += piece.text; continue; }
			if (origin < cursor) throw Error('source_order');
			const removed = prepared.source.slice(cursor, origin);
			if (removed !== inserted) changes.push(minimalHistorySplice(removed, inserted, cursor));
			inserted = ''; cursor = origin + piece.text.length;
		}
		const removed = prepared.source.slice(cursor);
		if (removed !== inserted) changes.push(minimalHistorySplice(removed, inserted, cursor));
		const splices = changes.length <= 64 ? changes.reverse() : [minimalHistorySplice(prepared.source, after)];
		if (!new HistorySource(prepared.source).apply(splices)?.sameParts([after])) throw Error('plan');
		return {ok: true, splices, after, superseded, overlaps: superseded.filter(row => row.reason === 'later_edit')};
	} catch (_) { return historyFailure('history_invalid'); }
}
