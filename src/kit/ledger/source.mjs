// SPDX-License-Identifier: MIT

const historyBoundary = (source, at) => Number.isSafeInteger(at) && at >= 0 && !Object.is(at, -0) && at <= source.length &&
	!(at > 0 && at < source.length && (source.charCodeAt(at - 1) & 0xFC00) === 0xD800 &&
	(source.charCodeAt(at) & 0xFC00) === 0xDC00);

const sourceLeaf = (text, from = 0, to = text.length) => {
	if (typeof text !== 'string') throw new TypeError('source string required');
	return to > from ? {text, from, length: to - from, height: 1} : null;
};
const sourceLeafText = node => node.from === 0 && node.length === node.text.length
	? node.text : node.text.slice(node.from, node.from + node.length);
const SOURCE_LEAF_LIMIT = 4096;
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
	if (left.text !== undefined && right.text !== undefined && left.length + right.length <= SOURCE_LEAF_LIMIT)
		return sourceLeaf(sourceLeafText(left) + sourceLeafText(right));
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
		yield from === 0 && to === node.length ? sourceString(node) : node.text.slice(node.from + from, node.from + to); return;
	}
	if (from < node.left.length) yield* sourceParts(node.left, from, Math.min(to, node.left.length));
	if (to > node.left.length) yield* sourceParts(node.right, Math.max(0, from - node.left.length), to - node.left.length);
}
function* sourceLeaves(node) {
	if (!node) return;
	if (node.text !== undefined) { yield node; return; }
	yield* sourceLeaves(node.left); yield* sourceLeaves(node.right);
}
const nodeTexts = new WeakMap();
function sourceString(node) {
	if (!node) return '';
	if (node.text !== undefined && node.length <= SOURCE_LEAF_LIMIT) return sourceLeafText(node);
	let text = nodeTexts.get(node);
	if (text === undefined) {
		text = node.text !== undefined ? sourceLeafText(node) : sourceString(node.left) + sourceString(node.right);
		nodeTexts.set(node, text);
	}
	return text;
}
const replacements = new WeakMap(), texts = new WeakMap(), edits = new WeakMap();
export const sourceEdit = source => edits.get(source) || null;
const INITIAL_LEAF_CHARS = 16384;
export class HistorySource {
	#root;
	constructor(text) {
		if (typeof text === 'string' && text.length > INITIAL_LEAF_CHARS) {
			const leaves = [];
			for (let from = 0; from < text.length;) {
				let to = Math.min(text.length, from + INITIAL_LEAF_CHARS);
				if (to < text.length && (text.charCodeAt(to - 1) & 0xfc00) === 0xd800 && (text.charCodeAt(to) & 0xfc00) === 0xdc00) to++;
				leaves.push(sourceLeaf(text, from, to));
				from = to;
			}
			const build = (from, to) => from === to ? null : to - from === 1 ? leaves[from]
				: sourceNode(build(from, (from + to) >> 1), build((from + to) >> 1, to));
			this.#root = build(0, leaves.length);
		} else this.#root = sourceLeaf(text);
		Object.freeze(this);
	}
	static owns(value) { return value !== null && typeof value === 'object' && #root in value; }
	static #fromRoot(root) { const source = new HistorySource(''); source.#root = root; return source; }
	static fromParts(parts) {
		const leaves = [];
		for (const text of parts) {
			if (typeof text !== 'string') throw new TypeError('source string required');
			if (text.length <= INITIAL_LEAF_CHARS) {
				const leaf = sourceLeaf(text);
				if (leaf) leaves.push(leaf);
				continue;
			}
			for (let from = 0; from < text.length;) {
				let to = Math.min(text.length, from + INITIAL_LEAF_CHARS);
				if (to < text.length && (text.charCodeAt(to - 1) & 0xfc00) === 0xd800 && (text.charCodeAt(to) & 0xfc00) === 0xdc00) to++;
				leaves.push(sourceLeaf(text, from, to));
				from = to;
			}
		}
		const build = (from, to) => from === to ? null : to - from === 1 ? leaves[from]
			: sourceNode(build(from, Math.floor((from + to) / 2)), build(Math.floor((from + to) / 2), to));
		return HistorySource.#fromRoot(build(0, leaves.length));
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
		if (from === 0 && to === this.length) return sourceString(root);
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
			if ((leaf.text !== text || from !== at) && leaf.text.slice(from, from + length) !== text.slice(at, at + length)) return false;
			offset += length; at += length;
			if (offset === leaf.length) { leaf = leaves.next().value; offset = 0; }
		}
		return !leaf;
	}
	sameSource(other) {
		if (!(other instanceof HistorySource) || this.length !== other.length) return false;
		if (this.#root === other.#root) return true;
		const left = sourceLeaves(this.#root), right = sourceLeaves(other.#root);
		let a = left.next().value, b = right.next().value, i = 0, j = 0;
		while (a && b) {
			const count = Math.min(a.length - i, b.length - j), from = a.from + i, to = b.from + j;
			if ((a.text !== b.text || from !== to) && a.text.slice(from, from + count) !== b.text.slice(to, to + count)) return false;
			i += count; j += count;
			if (i === a.length) { a = left.next().value; i = 0; }
			if (j === b.length) { b = right.next().value; j = 0; }
		}
		return !a && !b;
	}
	replace(pos, length, text, retain = true) {
		if (!Number.isSafeInteger(pos) || pos < 0 || Object.is(pos, -0) || !Number.isSafeInteger(length) ||
			length < 0 || Object.is(length, -0) || pos + length > this.length || typeof text !== 'string') throw new RangeError('source splice out of range');
		const held = retain && replacements.get(this);
		if (held && held.pos === pos && held.length === length && held.text === text) {
			const source = held.source.deref();
			if (source) { retainEditFacts(this, source, pos, length, text); return source; }
		}
		const [left, rest] = sourceSplit(this.#root, pos), [, right] = sourceSplit(rest, length);
		const source = HistorySource.#fromRoot(sourceJoin(sourceJoin(left, sourceLeaf(text)), right));
		if (retain) {
			edits.set(source, Object.freeze({before: new WeakRef(this), pos, removed: length, inserted: text.length, text}));
			retainEditFacts(this, source, pos, length, text);
			replacements.set(this, {pos, length, text, source: new WeakRef(source)});
		}
		return source;
	}
	before(splices) {
		if (this.length <= SOURCE_LEAF_LIMIT) {
			let text = this.slice();
			for (let index = splices.length - 1; index >= 0; index--) {
				const row = splices[index], pos = row?.pos, removed = row?.removed, inserted = row?.inserted;
				if (!Number.isSafeInteger(pos) || pos < 0 || Object.is(pos, -0) || typeof removed !== 'string' || typeof inserted !== 'string' ||
					/[\uD800-\uDFFF]/u.test(removed) || /[\uD800-\uDFFF]/u.test(inserted) || pos + inserted.length > text.length || !text.startsWith(inserted, pos)) return null;
				text = text.slice(0, pos) + removed + text.slice(pos + inserted.length);
				if (!historyBoundary(text, pos) || !historyBoundary(text, pos + removed.length)) return null;
				if (text.length > SOURCE_LEAF_LIMIT) return new HistorySource(text).before(splices.slice(0, index));
			}
			return new HistorySource(text);
		}
		let source = this;
		for (let index = splices.length - 1; index >= 0; index--) {
			const row = splices[index], pos = row?.pos, removed = row?.removed, inserted = row?.inserted;
			if (!Number.isSafeInteger(pos) || pos < 0 || Object.is(pos, -0) ||
				typeof removed !== 'string' || typeof inserted !== 'string' ||
				/[\uD800-\uDFFF]/u.test(removed) || /[\uD800-\uDFFF]/u.test(inserted) || !source.matches(pos, inserted)) return null;
			source = source.replace(pos, inserted.length, removed, false);
			if (!historyBoundary(source, pos) || !historyBoundary(source, pos + removed.length)) return null;
		}
		return source;
	}
	apply(splices, inverse = false) { return applySource(this, splices, inverse); }
}

const recent = [], MAX_CHARS = 32 * 1024 * 1024;
function retainView(text, source, admitted = false) {
	const at = recent.findIndex(row => row.source === source);
	const previous = at >= 0 ? recent.splice(at, 1)[0] : null;
	if (admitted && previous?.admission !== 2) for (const row of recent) row.admission = Math.max(0, row.admission - 1);
	recent.push({text, source, admission: admitted ? 2 : previous?.admission || 0});
	let chars = recent.reduce((sum, row) => sum + row.text.length, 0);
	while (recent.length > 1 && (recent.length > 4 || chars > MAX_CHARS)) {
		let remove = recent.findIndex(row => row.admission === 0);
		if (remove < 0) remove = recent.findIndex(row => row.admission === 1);
		chars -= recent.splice(remove < 0 ? 0 : remove, 1)[0].text.length;
	}
	return source;
}

export function sourceView(text, hint = null) {
	if (typeof text !== 'string') throw new TypeError('source string required');
	const held = recentView(text, hint);
	if (held) return held;
	const source = new HistorySource(text);
	texts.set(source, text);
	return retainView(text, source);
}

function recentView(text, hint = null) {
	if (hint) for (let at = recent.length - 1; at >= 0; at--) {
		const row = recent[at], held = replacements.get(row.source);
		if (held && held.pos === hint.pos && held.length === hint.length && held.text === hint.text && row.text === text) return row.source;
	}
	for (let at = recent.length - 1; at >= 0; at--) if (recent[at].text === text) return recent[at].source;
	return null;
}
export const heldSourceView = text => recentView(text);

const facts = new WeakMap();
function measureSource(text) {
	let controls = 0, lone = 0, utf8 = 0, data = 0, jsonExtra = 0;
	const markers = [];
	for (let at = 0; at < text.length; at++) {
		const code = text.charCodeAt(at);
		if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) jsonExtra++;
		else if (code < 32) jsonExtra += 5;
		if (code < 32 && code !== 9 && code !== 10 && code !== 13 || code === 127) controls++;
		if (code < 0x80) utf8++;
		else if (code < 0x800) utf8 += 2;
		else if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(at + 1) >= 0xdc00 && text.charCodeAt(at + 1) <= 0xdfff) {utf8 += 4; at++;}
		else {utf8 += 3; if (code >= 0xd800 && code <= 0xdfff) lone++;}
		if ((code | 32) === 100 && (text.charCodeAt(at + 1) | 32) === 97 &&
			(text.charCodeAt(at + 2) | 32) === 116 && (text.charCodeAt(at + 3) | 32) === 97 && text.charCodeAt(at + 4) === 58) { data++; markers.push(at); }
	}
	return {controls, lone, utf8, data, markers: Object.freeze(markers), jsonChars: text.length + jsonExtra + lone * 5, jsonBytes: utf8 + jsonExtra + lone * 3};
}

export function heldSourceFacts(source) {
	return facts.get(typeof source === 'string' ? recentView(source) : source) || null;
}

export function sourceFacts(text) {
	const source = sourceView(text), held = facts.get(source);
	retainView(text, source, true);
	if (held) return held;
	const measured = Object.freeze(measureSource(text));
	facts.set(source, measured);
	return measured;
}

function retainEditFacts(before, after, pos, length, inserted) {
	const held = facts.get(before), present = facts.get(after);
	if (present || !held) return present;
	const left = before.slice(Math.max(0, pos - 4), pos), removed = before.slice(pos, pos + length),
		right = before.slice(pos + length, Math.min(before.length, pos + length + 4));
	const was = measureSource(left + removed + right), now = measureSource(left + inserted + right), next = {...held};
	for (const key of ['controls', 'lone', 'utf8', 'data', 'jsonChars', 'jsonBytes']) next[key] += now[key] - was[key];
	const start = pos - left.length, end = pos + length, delta = inserted.length - length;
	next.markers = Object.freeze([
		...held.markers.filter(at => at < start),
		...now.markers.filter(at => at < left.length + inserted.length).map(at => at + start),
		...held.markers.filter(at => at >= end).map(at => at + delta),
	]);
	const measured = Object.freeze(next);
	facts.set(after, measured);
	return measured;
}

export function sourceText(source) {
	if (!HistorySource.owns(source) || Object.getPrototypeOf(source) !== HistorySource.prototype) throw new TypeError('immutable source required');
	let text = texts.get(source);
	if (text === undefined) {
		text = source.slice();
		texts.set(source, text);
	}
	retainView(text, source);
	return text;
}

function applySource(source, splices, inverse) {
	if (!Array.isArray(splices)) return null;
	for (let index = 0; index < splices.length; index++) {
		const row = splices[inverse ? splices.length - 1 - index : index];
		const pos = row?.pos, removed = inverse ? row?.inserted : row?.removed, inserted = inverse ? row?.removed : row?.inserted;
		if (typeof removed !== 'string' || typeof inserted !== 'string' ||
			/[\uD800-\uDFFF]/u.test(removed) || /[\uD800-\uDFFF]/u.test(inserted)) return null;
		if (!historyBoundary(source, pos) || !historyBoundary(source, pos + removed.length) ||
			!source.matches(pos, removed)) return null;
		source = source.replace(pos, removed.length, inserted);
	}
	return source;
}

export function transformText(text, splices, inverse = false) {
	if (typeof text !== 'string') throw new TypeError('source string required');
	if (!Array.isArray(splices)) return null;
	for (let index = 0; index < splices.length; index++) {
		const row = splices[inverse ? splices.length - 1 - index : index];
		const pos = row?.pos, removed = inverse ? row?.inserted : row?.removed, inserted = inverse ? row?.removed : row?.inserted;
		if (typeof removed !== 'string' || typeof inserted !== 'string' ||
			/[\uD800-\uDFFF]/u.test(removed) || /[\uD800-\uDFFF]/u.test(inserted)) return null;
		if (text.length > SOURCE_LEAF_LIMIT) {
			const source = applySource(sourceView(text, {pos, length: removed.length, text: inserted}),
				inverse ? splices.slice(0, splices.length - index) : splices.slice(index), inverse);
			return source === null ? null : sourceText(source);
		}
		if (!historyBoundary(text, pos) || !historyBoundary(text, pos + removed.length) || !text.startsWith(removed, pos)) return null;
		text = text.slice(0, pos) + inserted + text.slice(pos + removed.length);
	}
	return text;
}

export function replaceText(text, rows) {
	if (typeof text !== 'string') throw new TypeError('source string required');
	let source = text;
	for (const row of rows) {
		const pos = row?.pos, length = row?.remove, inserted = row?.insert;
		if (!Number.isSafeInteger(pos) || pos < 0 || Object.is(pos, -0) ||
			!Number.isSafeInteger(length) || length < 0 || Object.is(length, -0) ||
			pos + length > source.length || typeof inserted !== 'string') throw new RangeError('source splice out of range');
		if (typeof source === 'string') source = sourceView(source, {pos, length, text: inserted});
		source = source.replace(pos, length, inserted);
	}
	return sourceText(typeof source === 'string' ? sourceView(source) : source);
}

