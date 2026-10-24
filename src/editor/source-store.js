// RAPIER_SOURCE_STORE_MODULE */` slot in editor/engine.js -- ahead of `rapier.document.source`'s own
globalThis.RapierSourceStore = (() => {

const MAX_BYTES = 64 * 1024 * 1024;
const sourceEncoder = new TextEncoder();
const PIECE_CHARS = 65536;
const MERGE_CHARS = 4096;

const CONTENT_STEP = 256, CONTENT_BASE_A = 65537, CONTENT_BASE_B = 65539;
const CONTENT_PRIME_A = 2147483647, CONTENT_PRIME_B = 2147483629;
const contentKey = (length, a, b) => length + ':' + (a >>> 0).toString(36) + ':' + (b >>> 0).toString(36);
function contentProduct(a, b, prime) {
	return ((a * (b >>> 16) % prime) * 65536 + a * (b & 65535)) % prime;
}
function contentStepA(value, code) {
	const full = value * CONTENT_BASE_A + code;
	const folded = (full & 0x7fffffff) + (full / 2147483648 | 0);
	return folded >= CONTENT_PRIME_A ? folded - CONTENT_PRIME_A : folded;
}
function contentStepB(value, code) {
	const full = value * CONTENT_BASE_B + code;
	const folded = (full & 0x7fffffff) + (full / 2147483648 | 0) * 19;
	return folded >= CONTENT_PRIME_B ? folded - CONTENT_PRIME_B : folded;
}
function contentIdOf(value) {
	const text = String(value == null ? '' : value);
	let a = 0, b = 0;
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i) + 1;
		a = contentStepA(a, code);
		b = contentStepB(b, code);
	}
	return contentKey(text.length, a, b);
}
function contentPower(base, length, prime) {
	let result = 1;
	for (; length; length >>>= 1, base = contentProduct(base, base, prime)) if (length & 1) result = contentProduct(result, base, prime);
	return result;
}
function contentIndex(text) {
	const checkpoints = new Uint32Array((Math.floor(text.length / CONTENT_STEP) + 1) * 2);
	let a = 0, b = 0;
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i) + 1;
		a = contentStepA(a, code);
		b = contentStepB(b, code);
		if ((i + 1) % CONTENT_STEP === 0) {
			const slot = (i + 1) / CONTENT_STEP * 2;
			checkpoints[slot] = a; checkpoints[slot + 1] = b;
		}
	}
	return {text, checkpoints, a, b};
}
function contentRange(index, start, end) {
	const prefix = at => {
		if (at === index.text.length) return [index.a, index.b];
		const slot = Math.floor(at / CONTENT_STEP);
		let a = index.checkpoints[slot * 2], b = index.checkpoints[slot * 2 + 1];
		for (let i = slot * CONTENT_STEP; i < at; i++) {
			const code = index.text.charCodeAt(i) + 1;
			a = contentStepA(a, code);
			b = contentStepB(b, code);
		}
		return [a, b];
	};
	const [a, b] = prefix(start), [c, d] = prefix(end);
	const powerA = contentPower(CONTENT_BASE_A, end - start, CONTENT_PRIME_A);
	const powerB = contentPower(CONTENT_BASE_B, end - start, CONTENT_PRIME_B);
	return {contentA: (c - contentProduct(a, powerA, CONTENT_PRIME_A) + CONTENT_PRIME_A) % CONTENT_PRIME_A,
		contentB: (d - contentProduct(b, powerB, CONTENT_PRIME_B) + CONTENT_PRIME_B) % CONTENT_PRIME_B, powerA, powerB};
}

const SPACE = new Uint8Array(65536);
for (const code of [9, 10, 11, 12, 13, 32, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009,
	0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff]) SPACE[code] = 1;

function fnv1a32(str) {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
	return (h >>> 0).toString(36);
}

const scanState = () => ({fnv: 0x811c9dc5, a: 1, b: 0, bytes: 0});
function scanSpan(text, start, end, state, countBytes = false) {
	let {fnv, a, b, bytes} = state;
	for (let at = start; at < end;) {
		const stop = Math.min(end, at + 4096);
		for (; at < stop; at++) {
			const code = text.charCodeAt(at);
			fnv = Math.imul(fnv ^ code, 16777619); a += code; b += a;
			if (countBytes) bytes += code < 0x80 ? 1 : code < 0x800 ? 2
				: (code & 0xfc00) === 0xdc00 && at > 0 && (text.charCodeAt(at - 1) & 0xfc00) === 0xd800 ? 1 : 3;
		}
		a %= 65521; b %= 65521;
	}
	state.fnv = fnv; state.a = a; state.b = b; state.bytes = bytes;
	return state;
}
const finishIntegrity = (chars, state) => ({chars, fnv: (state.fnv >>> 0).toString(36), adler: (((state.b << 16) | state.a) >>> 0).toString(36)});

function textIntegrity(value) {
	const text = String(value == null ? '' : value);
	return finishIntegrity(text.length, scanSpan(text, 0, text.length, scanState()));
}

function rowHash(value) {
	const fact = textIntegrity(value);
	return fact.chars + ':' + fact.fnv + ':' + fact.adler;
}

function rootAfter(root, row) {
	return rowHash(String(root || '') + ':' + row.pos + ':' +
		rowHash(row.removed) + ':' + rowHash(row.inserted));
}

function spliceBytes(at, oldText, newText, length, readSlice, bytesNow) {
	if (!Number.isSafeInteger(at) || at < 0 || at + oldText.length > length ||
			readSlice(at, at + oldText.length) !== oldText) {
		throw Object.assign(new Error('Canonical splice no longer matches the document.'), {
			code: 'target_changed',
		});
	}

	let byteStart = Math.max(0, at - 1);
	let byteEnd = Math.min(length, at + oldText.length + 1);
	const high = code => code >= 0xd800 && code <= 0xdbff;
	const low = code => code >= 0xdc00 && code <= 0xdfff;
	if (byteStart > 0 && low(readSlice(byteStart, byteStart + 1).charCodeAt(0)) &&
			high(readSlice(byteStart - 1, byteStart).charCodeAt(0))) byteStart--;
	if (byteEnd < length && high(readSlice(byteEnd - 1, byteEnd).charCodeAt(0)) &&
			low(readSlice(byteEnd, byteEnd + 1).charCodeAt(0))) byteEnd++;
	const byteBefore = readSlice(byteStart, byteEnd);
	const leftWitness = readSlice(byteStart, at);
	const rightWitness = readSlice(at + oldText.length, byteEnd);
	const nextBytes = bytesNow() - sourceEncoder.encode(byteBefore).length +
		sourceEncoder.encode(leftWitness + newText + rightWitness).length;
	if (nextBytes > MAX_BYTES) {
		throw Object.assign(new Error('document is too large (64 MiB maximum)'), {
			code: 'document_too_large',
		});
	}
	return nextBytes;
}

function create(value, restoredRootId = '', snapshot = null, preparation = null) {
	const initial = String(value == null ? '' : value);
	const buffers = snapshot ? snapshot.buffers.slice() : [initial];
	let bufferChars = buffers.reduce((total, buffer) => total + buffer.length, 0);
	const addBuffer = text => {
		const value = String(text || '');
		bufferChars += value.length;
		return buffers.push(value) - 1;
	};
	let length = snapshot ? snapshot.length : initial.length;
	let utf8Bytes = snapshot ? (snapshot.utf8Bytes ?? null) : null;
	let cached = snapshot ? snapshot.cached : initial;

	let cachedIntegrityValue = snapshot ? (snapshot.cachedIntegrityValue ?? null) : null;
	let rootId = snapshot ? snapshot.rootId : (restoredRootId || null);
	let cacheKey = snapshot ? snapshot.cacheKey : Object.freeze({});
	let cachedIntegrityKey = snapshot ? (snapshot.cachedIntegrityKey ?? null) : null;
	let coalescing = null;
	let initialRoot = snapshot ? (snapshot.initialRoot ?? null) : (restoredRootId || null);
	const rootNow = () => {
		if (rootId == null) {
			const fact = integrity();
			rootId = fact.chars + ':' + fact.fnv + ':' + fact.adler;
			if (initialRoot == null) initialRoot = rootId;
		}
		return rootId;
	};
	const initialRootNow = () => { if (initialRoot == null) rootNow(); return initialRoot; };
	const bytesNow = () => {
		if (utf8Bytes == null) {
			const text = read(), state = scanSpan(text, 0, text.length, scanState(), true);
			utf8Bytes = state.bytes;
			if (cachedIntegrityKey !== cacheKey) { cachedIntegrityValue = finishIntegrity(text.length, state); cachedIntegrityKey = cacheKey; }
		}
		return utf8Bytes;
	};
	const wordsBefore = (index, at) => {
		const slot = Math.floor(at / 1024), start = slot * 1024;
		const text = index.text.slice(start, at), runs = /\S+/g;
		let words = index.checkpoints[slot];
		while (runs.exec(text)) words++;
		if (text.length && start > 0 && /\S/.test(index.text[start - 1]) && /^\S/.test(text)) words--;
		return words;
	};
	const makePiece = (buffer, start, pieceLength) => {
		const text = buffers[buffer].slice(start, start + pieceLength);
		const content = contentIndex(text);
		const ends = [], crlfEnds = [], projectedEnds = [], checkpoints = new Uint32Array(Math.ceil(text.length / 1024) + 1);
		let words = 0, next = 1, word = false;
		for (let at = 0; at < text.length; at++) {
			const code = text.charCodeAt(at);
			if (code === 10 || code === 13) {
				if (code === 13 && text.charCodeAt(at + 1) === 10) {
					at++; ends.push(at + 1); crlfEnds.push(at + 1); projectedEnds.push(at + 1 - crlfEnds.length);
				} else ends.push(at + 1);
				word = false;
			} else if (SPACE[code] === 1) word = false;
			else if (!word) {
				word = true;
				while (next * 1024 <= at) checkpoints[next++] = words;
				words++;
			}
		}
		while (next < checkpoints.length) checkpoints[next++] = words;
		return { buffer, start, length: pieceLength, projected: pieceLength - crlfEnds.length, breaks: ends.length,
			lineEnds: new Uint32Array(ends), crlfEnds: new Uint32Array(crlfEnds), projectedEnds: new Uint32Array(projectedEnds),
			wordIndex: {text, checkpoints, words, content}, wordOffset: 0, words, headWord: /^\S/.test(text), tailWord: /\S$/.test(text),
			...contentRange(content, 0, text.length) };
	};
	const chunk = (buffer, start, span) => {
		const rows = [];
		const stop = start + span;
		while (start < stop) {
			let end = Math.min(stop, start + PIECE_CHARS);
			if (end < stop && buffers[buffer].charCodeAt(end - 1) === 13 &&
					buffers[buffer].charCodeAt(end) === 10) end++;
			rows.push(makePiece(buffer, start, end - start));
			start = end;
		}
		return rows;
	};
	let pieces = snapshot ? snapshot.pieces.map(piece => ({ ...piece }))
		: initial && !preparation ? chunk(0, 0, initial.length) : [];
	let sourceStarts = [], projectionStarts = [], breakStarts = [], totalProjected = 0, totalBreaks = 0, totalWords = 0, contentId = '';
	const reindex = () => {
		sourceStarts = new Array(pieces.length);
		projectionStarts = new Array(pieces.length);
		breakStarts = new Array(pieces.length);
		let source = 0, projection = 0, breaks = 0, words = 0, tailWord = false, contentA = 0, contentB = 0;
		for (let index = 0; index < pieces.length; index++) {
			sourceStarts[index] = source;
			projectionStarts[index] = projection;
			breakStarts[index] = breaks;
			source += pieces[index].length;
			projection += pieces[index].projected;
			breaks += pieces[index].breaks;
			words += pieces[index].words - (tailWord && pieces[index].headWord ? 1 : 0);
			tailWord = pieces[index].tailWord;
			contentA = (contentProduct(contentA, pieces[index].powerA, CONTENT_PRIME_A) + pieces[index].contentA) % CONTENT_PRIME_A;
			contentB = (contentProduct(contentB, pieces[index].powerB, CONTENT_PRIME_B) + pieces[index].contentB) % CONTENT_PRIME_B;
		}
		totalProjected = projection;
		totalBreaks = breaks;
		totalWords = words;
		contentId = contentKey(source, contentA, contentB);
	};
	reindex();
	const pieceText = piece => buffers[piece.buffer].slice(piece.start, piece.start + piece.length);
	const pieceAt = (starts, offset) => {
		let low = 0, high = starts.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (starts[middle] <= offset) low = middle + 1; else high = middle;
		}
		return Math.max(0, low - 1);
	};
	const countThrough = (ends, offset) => {
		let low = 0, high = ends.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (ends[middle] <= offset) low = middle + 1; else high = middle;
		}
		return low;
	};
	const slicePiece = (piece, start, end) => {
		const text = buffers[piece.buffer], offset = piece.start;
		if (start > 0 && text.charCodeAt(offset + start - 1) === 13 && text.charCodeAt(offset + start) === 10 ||
				end < piece.length && text.charCodeAt(offset + end - 1) === 13 && text.charCodeAt(offset + end) === 10)
			return makePiece(piece.buffer, offset + start, end - start);
		const cut = ends => ends.slice(countThrough(ends, start), countThrough(ends, end)).map(value => value - start);
		const lineEnds = cut(piece.lineEnds), crlfEnds = cut(piece.crlfEnds);
		const wordOffset = piece.wordOffset + start, stop = piece.wordOffset + end, index = piece.wordIndex;
		const words = end <= start ? 0 : wordsBefore(index, stop) - wordsBefore(index, wordOffset) +
			(wordOffset > 0 && /\S/.test(index.text[wordOffset - 1]) && /\S/.test(index.text[wordOffset]) ? 1 : 0);
		return {buffer: piece.buffer, start: offset + start, length: end - start, projected: end - start - crlfEnds.length,
			breaks: lineEnds.length, lineEnds, crlfEnds, projectedEnds: crlfEnds.map((value, at) => value - at - 1),
			wordIndex: index, wordOffset, words, headWord: end > start && /\S/.test(index.text[wordOffset]),
			tailWord: end > start && /\S/.test(index.text[stop - 1]), ...contentRange(index.content, wordOffset, stop)};
	};
	const merge = rows => {
		const out = [];
		for (const source of rows) {
			if (!source.length) continue;
			const row = { ...source };
			const prior = out[out.length - 1];
			if (prior && prior.length + row.length <= MERGE_CHARS) {
				const text = pieceText(prior) + pieceText(row);
				const buffer = addBuffer(text);
				out[out.length - 1] = makePiece(buffer, 0, text.length);
			} else out.push(row);
		}

		for (let index = 1; index < out.length; index++) {
			const prior = out[index - 1], row = out[index];
			if (buffers[prior.buffer].charCodeAt(prior.start + prior.length - 1) !== 13 ||
					buffers[row.buffer].charCodeAt(row.start) !== 10) continue;
			Object.assign(prior, slicePiece(prior, 0, prior.length - 1));
			Object.assign(row, slicePiece(row, 1, row.length));
			const buffer = addBuffer('\r\n');
			out.splice(index, 0, makePiece(buffer, 0, 2));
			if (!prior.length) { out.splice(index - 1, 1); index--; }
			if (!row.length) out.splice(index + 1, 1);
		}
		return out.filter(row => row.length);
	};
	const split = (start, stop = start) => {
		const from = pieceAt(sourceStarts, start), to = pieceAt(sourceStarts, stop);
		const left = pieces.slice(0, from), right = pieces.slice(to + 1);
		const first = pieces[from], last = pieces[to];
		if (first && start > sourceStarts[from]) left.push(start === sourceStarts[from] + first.length
			? first : slicePiece(first, 0, start - sourceStarts[from]));
		if (last && stop < sourceStarts[to] + last.length) right.unshift(stop === sourceStarts[to]
			? last : slicePiece(last, stop - sourceStarts[to], last.length));
		return [left, right];
	};
	const read = () => {
		if (cached == null) cached = pieces.map(pieceText).join('');
		return cached;
	};

	const integrity = () => {
		if (cachedIntegrityKey !== cacheKey) {
			cachedIntegrityValue = textIntegrity(read());
			cachedIntegrityKey = cacheKey;
		}
		return cachedIntegrityValue;
	};
	const integrityAsync = async ({yield: yieldWork, signal, onProgress} = {}) => {
		if (signal?.aborted) throw Object.assign(new Error('Canceled'), {name: 'AbortError'});
		if (cachedIntegrityKey === cacheKey) return cachedIntegrityValue;
		const pending = pieces, chars = length, state = scanState();
		let processed = 0;
		for (const piece of pending) {
			const text = buffers[piece.buffer], end = piece.start + piece.length;
			for (let start = piece.start; start < end;) {
				const stop = Math.min(end, start + PIECE_CHARS);
				scanSpan(text, start, stop, state);
				processed += stop - start; start = stop;
				onProgress?.(processed / chars);
				if (yieldWork && processed < chars) await yieldWork();
				if (signal?.aborted) throw Object.assign(new Error('Canceled'), {name: 'AbortError'});
				if (pieces !== pending) return null;
			}
		}
		cachedIntegrityKey = cacheKey;
		cachedIntegrityValue = finishIntegrity(chars, state);
		return cachedIntegrityValue;
	};
	const readSlice = (start = 0, end = length) => {
		const from = Math.max(0, Math.min(length, Number(start) || 0));
		const to = Math.max(from, Math.min(length, Number(end) || 0));
		if (cached != null) return cached.slice(from, to);
		let index = pieces.length ? pieceAt(sourceStarts, from) : 0, out = '';
		while (index < pieces.length && sourceStarts[index] < to) {
			const piece = pieces[index];
			const localStart = piece.start + Math.max(0, from - sourceStarts[index]);
			const localEnd = piece.start + Math.min(piece.length, to - sourceStarts[index]);
			out += buffers[piece.buffer].slice(localStart, localEnd);
			index++;
		}
		return out;
	};
	const lineAt = value => {
		const offset = Math.max(0, Math.min(length, Number(value) || 0));
		if (!pieces.length || offset === length) return totalBreaks;
		const index = pieceAt(sourceStarts, offset);
		const ends = pieces[index].lineEnds, local = offset - sourceStarts[index];
		let low = 0, high = ends.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (ends[middle] <= local) low = middle + 1; else high = middle;
		}
		return breakStarts[index] + low;
	};
	const lineStart = value => {
		const line = Math.max(0, Math.floor(Number(value) || 0));
		if (!line) return 0;
		if (line > totalBreaks) return length;
		let low = 0, high = pieces.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (breakStarts[middle] + pieces[middle].breaks < line) low = middle + 1;
			else high = middle;
		}
		return sourceStarts[low] + pieces[low].lineEnds[line - breakStarts[low] - 1];
	};
	const lineStarts = () => {
		const starts = new Uint32Array(totalBreaks + 1);
		let at = 1;
		for (let index = 0; index < pieces.length; index++) {
			const ends = pieces[index].lineEnds, offset = sourceStarts[index];
			for (let row = 0; row < ends.length; row++) starts[at++] = offset + ends[row];
		}
		return starts;
	};
	const lineEnd = value => {
		const line = Math.max(0, Math.floor(Number(value) || 0));
		if (line >= totalBreaks) return length;
		const end = lineStart(line + 1);
		return end - (readSlice(Math.max(0, end - 2), end) === '\r\n' ? 2 : 1);
	};
	const presence = new Map(snapshot?.presence?.map(([key, entry]) => [key, {...entry}]) || []);
	const literalCount = (text, entry) => {
		let count = 0, at = 0;
		if (entry.pattern) {
			entry.pattern.lastIndex = 0;
			let match;
			while ((match = entry.pattern.exec(text))) { count++; entry.pattern.lastIndex = match.index + 1; }
		} else while ((at = text.indexOf(entry.needle, at)) >= 0) { count++; at++; }
		return count;
	};
	const contains = (value, ignoreCase = false) => {
		const needle = String(value);
		if (!needle.length) return true;
		const key = (ignoreCase ? 'i:' : ':') + needle;
		let entry = presence.get(key);
		if (entry) return entry.count > 0;
		entry = {needle, pattern: ignoreCase ? new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null, count: 0};
		let tail = '';
		if (cached != null) entry.count = literalCount(cached, entry);
		else for (let index = 0; index < pieces.length; index++) {
			const text = tail + pieceText(pieces[index]);
			entry.count += literalCount(text, entry);
			tail = needle.length > 1 ? text.slice(1 - needle.length) : '';
		}
		if (needle.length <= 256) {
			if (presence.size === 8) presence.delete(presence.keys().next().value);
			presence.set(key, entry);
		}
		return entry.count > 0;
	};
	const transportPresence = (at, oldText, newText) => {
		const end = at + oldText.length;
		for (const entry of presence.values()) {
			const from = Math.max(0, at - entry.needle.length + 1);
			const to = Math.min(length, end + entry.needle.length - 1);
			const before = readSlice(from, at), after = readSlice(end, to);
			entry.count += literalCount(before + newText + after, entry) -
				literalCount(before + oldText + after, entry);
		}
	};
	const projectionAtSource = sourceOffset => {
		const offset = Math.max(0, Math.min(length, Number(sourceOffset) || 0));
		if (!pieces.length || offset === length) return totalProjected;
		const index = pieceAt(sourceStarts, offset);
		const local = offset - sourceStarts[index];
		return projectionStarts[index] + local - countThrough(pieces[index].crlfEnds, local);
	};
	const sourceAtProjection = projectionOffset => {
		const offset = Math.max(0, Math.min(totalProjected, Number(projectionOffset) || 0));
		if (!pieces.length || offset === totalProjected) return length;
		const index = pieceAt(projectionStarts, offset);
		const target = offset - projectionStarts[index];
		return sourceStarts[index] + target + countThrough(pieces[index].projectedEnds, target);
	};
	const capture = (options = null) => {
		const coalesce = options?.coalesce === true;
		const savedBuffers = buffers.slice();
		const savedPieces = pieces.map(piece => ({ ...piece }));
		const savedPresence = Array.from(presence, ([key, entry]) => [key, {...entry}]);
		const savedCacheKey = cacheKey;
		const savedCoalescing = coalescing;
		const savedLength = length, savedBytes = utf8Bytes, savedRoot = rootNow(), savedInitialRoot = initialRootNow(), savedContentId = contentId;
		let savedText = cached;
		let savedIntegrityValue = cachedIntegrityKey === savedCacheKey ? cachedIntegrityValue : null;
		const savedRead = () => {
			if (savedText == null) savedText = savedPieces.map(piece =>
				savedBuffers[piece.buffer].slice(piece.start, piece.start + piece.length)).join('');
			return savedText;
		};
		const saved = {
			rootId: savedRoot,
			contentId: savedContentId,
			read: savedRead,
			reuseText() {
				if (length !== savedLength) return false;
				let left = 0, right = 0, leftOffset = 0, rightOffset = 0;
				while (left < pieces.length && right < savedPieces.length) {
					const a = pieces[left], b = savedPieces[right];
					const count = Math.min(a.length - leftOffset, b.length - rightOffset);
					const aText = buffers[a.buffer], bText = savedBuffers[b.buffer];
					const aStart = a.start + leftOffset, bStart = b.start + rightOffset;
					if (!(aText === bText && aStart === bStart) &&
							aText.slice(aStart, aStart + count) !== bText.slice(bStart, bStart + count)) return false;
					leftOffset += count; rightOffset += count;
					if (leftOffset === a.length) { left++; leftOffset = 0; }
					if (rightOffset === b.length) { right++; rightOffset = 0; }
				}
				if (savedText != null) cached = savedText;
				if (savedIntegrityValue != null) {
					cachedIntegrityValue = savedIntegrityValue;
					cachedIntegrityKey = cacheKey;
				}
				return true;
			},

			integrity() {
				if (savedIntegrityValue == null) savedIntegrityValue = textIntegrity(savedRead());
				return savedIntegrityValue;
			},
			restore() {
				buffers.length = 0; buffers.push(...savedBuffers);
				bufferChars = savedBuffers.reduce((total, buffer) => total + buffer.length, 0);
				pieces = savedPieces.map(piece => ({ ...piece }));
				length = savedLength; utf8Bytes = savedBytes; cached = savedText; rootId = savedRoot; initialRoot = savedInitialRoot;
				cacheKey = savedCacheKey;
				coalescing = savedCoalescing && !savedCoalescing.lifecycle.closed ? savedCoalescing : null;
				cachedIntegrityValue = savedIntegrityValue;
				cachedIntegrityKey = savedIntegrityValue == null ? null : savedCacheKey;
				presence.clear();
				for (const [key, entry] of savedPresence) presence.set(key, {...entry});
				reindex();
			},
		};
		if (coalesce) {
			const lifecycle = {token: saved, closed: false};
			saved.seal = () => {
				if (lifecycle.closed || coalescing?.lifecycle !== lifecycle || coalescing.key !== cacheKey) return null;
				if (coalescing.sealed) return coalescing.sealed;
				const splices = [];
				for (let tail = coalescing.tail; tail; tail = tail.previous) splices.push(tail.row);
				splices.reverse();
				const sealed = Object.freeze({splices: Object.freeze(splices), rootId: splices.reduce(rootAfter, savedRoot)});
				rootId = sealed.rootId;
				coalescing = {...coalescing, sealed};
				return sealed;
			};
			saved.release = () => {
				lifecycle.closed = true; lifecycle.token = null;
				if (coalescing?.lifecycle === lifecycle) coalescing = null;
			};
			coalescing = {lifecycle, key: cacheKey, tail: null};
		}
		return Object.freeze(saved);
	};
	const fork = (restoredRootId = '') => create('', restoredRootId || rootNow(), {
		buffers, pieces, length, utf8Bytes, cached, rootId: restoredRootId || rootId, cacheKey,
		initialRoot: restoredRootId || initialRootNow(), cachedIntegrityKey, cachedIntegrityValue,
		presence: Array.from(presence, ([key, entry]) => [key, {...entry}]),
	});
	const preview = () => {
		let text = read(), bytes = bytesNow();
		const slice = (start, end) => text.slice(start, end), size = () => bytes;
		return Object.freeze({
			read: () => text,
			splice(start, removed, inserted) {
				const at = Number(start), oldText = String(removed == null ? '' : removed), newText = String(inserted == null ? '' : inserted);
				const nextBytes = spliceBytes(at, oldText, newText, text.length, slice, size);
				text = text.slice(0, at) + newText + text.slice(at + oldText.length); bytes = nextBytes;
				return {pos: at, removed: oldText, inserted: newText};
			},
		});
	};
	const sourceOffsetFromProjection = (projectionOffset, start = 0, end = length) => {
		const from = Math.max(0, Math.min(length, Number(start) || 0));
		const to = Math.max(from, Math.min(length, Number(end) || 0));
		const requested = Math.max(0, Number(projectionOffset) || 0);
		if (!requested || from === to) return from;

		const leadingLf = from > 0 && readSlice(from - 1, from + 1) === '\r\n';
		const target = Math.min(projectionAtSource(to), projectionAtSource(from) +
			requested - (leadingLf ? 1 : 0));
		return Math.min(to, sourceAtProjection(target));
	};
	const projectionOffsetFromSource = (sourceOffset, start = 0) => {
		const from = Math.max(0, Math.min(length, Number(start) || 0));
		const to = Math.max(from, Math.min(length, Number(sourceOffset) || 0));
		return projectionAtSource(to) - projectionAtSource(from) +
			(to > from && from > 0 && readSlice(from - 1, from + 1) === '\r\n' ? 1 : 0);
	};
	const splice = (start, removed, inserted, captureToken = null) => {
		const at = Number(start);
		const oldText = String(removed == null ? '' : removed);
		const newText = String(inserted == null ? '' : inserted);
		const owner = captureToken == null ? null : coalescing;
		if (captureToken != null && (!owner || owner.lifecycle.closed || owner.lifecycle.token !== captureToken || owner.key !== cacheKey)) {
			throw Object.assign(new Error('The captured source no longer owns this splice.'), {code: 'target_changed'});
		}
		const nextBytes = spliceBytes(at, oldText, newText, length, readSlice, bytesNow);
		const priorRoot = rootNow();
		const [left, right] = split(at, at + oldText.length);
		const insertedPieces = newText ? chunk(addBuffer(newText), 0, newText.length) : [];
		transportPresence(at, oldText, newText);
		pieces = merge(left.concat(insertedPieces, right));
		length += newText.length - oldText.length;
		utf8Bytes = nextBytes;

		cached = null;
		reindex();

		if (buffers.length > pieces.length * 4 + 64 ||
				bufferChars > length + Math.max(1024 * 1024, Math.ceil(length / 2))) {
			const live = [];
			for (const piece of pieces) {
				const text = pieceText(piece);
				piece.buffer = live.length;
				piece.start = 0;
				live.push(text);
			}
			buffers.length = 0;
			buffers.push(...live);
			bufferChars = live.reduce((total, buffer) => total + buffer.length, 0);
		}
		const row = {pos: at, removed: oldText, inserted: newText};
		rootId = rootAfter(priorRoot, row);
		cacheKey = Object.freeze({});
		if (owner) {
			const tail = owner.tail, last = tail?.row;
			let next = row, previous = tail;
			if (last && at === last.pos + last.inserted.length) {
				next = {pos: last.pos, removed: last.removed + oldText, inserted: last.inserted + newText};
				previous = tail.previous;
			} else if (last && !newText && !last.inserted && at + oldText.length === last.pos) {
				next = {pos: at, removed: oldText + last.removed, inserted: ''};
				previous = tail.previous;
			}
			coalescing = {lifecycle: owner.lifecycle, key: cacheKey, tail: {row: Object.freeze({...next}), previous}};
		} else coalescing = null;
		return row;
	};
	const warm = () => { bytesNow(); rootNow(); };
	const warmAsync = async ({yield: yieldWork, signal, onProgress} = {}) => {
		if (signal?.aborted) throw Object.assign(new Error('Canceled'), {name: 'AbortError'});
		if (cachedIntegrityKey === cacheKey && utf8Bytes != null && rootId != null) return true;
		const pending = cacheKey;
		const text = read(), countBytes = utf8Bytes == null, state = scanState();
		for (let start = 0; start < text.length;) {
			if (signal?.aborted) throw Object.assign(new Error('Canceled'), {name: 'AbortError'});
			const end = Math.min(text.length, start + PIECE_CHARS);
			scanSpan(text, start, end, state, countBytes);
			start = end;
			if (onProgress) onProgress(start / text.length);
			if (yieldWork) await yieldWork();
			if (cacheKey !== pending) return false;
		}
		if (signal?.aborted) throw Object.assign(new Error('Canceled'), {name: 'AbortError'});
		if (cacheKey !== pending) return false;
		cachedIntegrityKey = pending;
		cachedIntegrityValue = finishIntegrity(text.length, state);
		if (countBytes) utf8Bytes = state.bytes;
		rootNow();
		return true;
	};
	let lastView = null;
	const view = () => {
		if (lastView?.cacheKey === cacheKey) return lastView;
		const spans = Object.freeze(pieces.map(piece => Object.freeze([buffers[piece.buffer], piece.start, piece.length])));
		const viewLength = length, viewKey = cacheKey, viewRoot = rootNow();
		let text = cached, integrityValue = cachedIntegrityKey === cacheKey ? cachedIntegrityValue : null;
		const readView = () => {
			if (text == null) text = cacheKey === viewKey ? read() : spans.map(([buffer, start, count]) => buffer.slice(start, start + count)).join('');
			return text;
		};
		function* parts() {
			let carry = '';
			for (const [buffer, start, count] of spans) {
				let part = carry + buffer.slice(start, start + count);
				carry = '';
				if (part.length && (part.charCodeAt(part.length - 1) & 0xfc00) === 0xd800) { carry = part.slice(-1); part = part.slice(0, -1); }
				if (part) yield part;
			}
			if (carry) yield carry;
		}
		const charFrom = (index, offset) => spans[index][0].charCodeAt(spans[index][1] + offset);
		const self = Object.freeze({
			length: viewLength, rootId: viewRoot, cacheKey: viewKey, spans,
			read: readView, parts,
			async integrityAsync({yield: yieldWork, signal} = {}) {
				if (integrityValue != null) return integrityValue;
				const state = scanState();
				let turn = 0;
				for (const [buffer, start, count] of spans) {
					for (let at = start, end = start + count; at < end;) {
						const stop = Math.min(end, at + PIECE_CHARS);
						scanSpan(buffer, at, stop, state); at = stop;
						if (++turn % 4 === 0 && yieldWork) await yieldWork();
						if (signal?.aborted) throw Object.assign(new Error('Canceled'), {name: 'AbortError'});
					}
				}
				return integrityValue = finishIntegrity(viewLength, state);
			},
			changeFrom(base) {
				const other = base.spans, limit = Math.min(base.length, viewLength);
				let start = 0, i = 0, io = 0, j = 0, jo = 0;
				while (i < spans.length && j < other.length && start < limit) {
					const a = spans[i], b = other[j];
					if (a[0] === b[0] && a[1] + io === b[1] + jo) {
						const step = Math.min(a[2] - io, b[2] - jo, limit - start);
						start += step; io += step; jo += step;
					} else if (charFrom(i, io) === other[j][0].charCodeAt(other[j][1] + jo)) { start++; io++; jo++; }
					else break;
					if (io === a[2]) { i++; io = 0; }
					if (j < other.length && jo === other[j][2]) { j++; jo = 0; }
				}
				let end = 0;
				i = spans.length - 1; io = 0; j = other.length - 1; jo = 0;
				while (i >= 0 && j >= 0 && end < limit - start) {
					const a = spans[i], b = other[j];
					const aEnd = a[1] + a[2] - io, bEnd = b[1] + b[2] - jo;
					if (a[0] === b[0] && aEnd === bEnd) {
						const step = Math.min(a[2] - io, b[2] - jo, limit - start - end);
						end += step; io += step; jo += step;
					} else if (a[0].charCodeAt(aEnd - 1) === b[0].charCodeAt(bEnd - 1)) { end++; io++; jo++; }
					else break;
					if (io === a[2]) { i--; io = 0; }
					if (j >= 0 && jo === other[j][2]) { j--; jo = 0; }
				}
				let inserted = '';
				for (let at = 0, index = 0; index < spans.length && at < viewLength - end; index++) {
					const [buffer, from, count] = spans[index], lo = Math.max(at, start), hi = Math.min(at + count, viewLength - end);
					if (lo < hi) inserted += buffer.slice(from + lo - at, from + hi - at);
					at += count;
				}
				return {start, removed: base.length - start - end, inserted};
			},
		});
		return lastView = self;
	};
	const store = Object.freeze({
		read, integrity, integrityAsync, readSlice, contains, splice, capture, view, fork, preview, lineAt, lineStart, lineStarts, lineEnd, sourceOffsetFromProjection,
		projectionOffsetFromSource, warm, warmAsync,
		get length() { return length; },
		get lineCount() { return totalBreaks + 1; },
		get wordCount() { return totalWords; },
		get utf8Bytes() { return bytesNow(); },
		get rootId() { return rootNow(); },
		get contentId() { return contentId; },
		get cacheKey() { return cacheKey; },
		get initialRootId() { return initialRootNow(); },
	});
	if (!preparation) return store;
	let cursor = 0, finished = false, settled = false, failure = null, resolveComplete, rejectComplete;
	const state = scanState();
	const complete = new Promise((resolve, reject) => { resolveComplete = resolve; rejectComplete = reject; });
	complete.catch(() => {});
	const aborted = () => Object.assign(new Error('Canceled'), {name: 'AbortError'});
	const fail = error => {
		if (settled || failure) return;
		failure = error; preparation.signal?.removeEventListener('abort', cancel); rejectComplete(error);
	};
	const cancel = () => fail(aborted());
	const check = () => {
		if (failure) throw failure;
		if (!finished && preparation.signal?.aborted) { cancel(); throw failure; }
	};
	const advance = () => {
		check();
		let end = Math.min(initial.length, cursor + PIECE_CHARS);
		if (end < initial.length && initial.charCodeAt(end - 1) === 13 && initial.charCodeAt(end) === 10) end++;
		pieces.push(makePiece(0, cursor, end - cursor));
		scanSpan(initial, cursor, end, state, true); cursor = end;
	};
	const finish = () => {
		if (finished) return;
		check();
		utf8Bytes = state.bytes;
		cachedIntegrityKey = cacheKey;
		cachedIntegrityValue = finishIntegrity(length, state);
		rootNow();
		reindex();
		finished = true;
		preparation.onReady?.(store);
		check();
		settled = true; preparation.signal?.removeEventListener('abort', cancel); resolveComplete(store);
	};
	const ensureComplete = () => {
		check();
		if (finished) return;
		try { while (cursor < initial.length) advance(); finish(); }
		catch (error) { fail(error); throw error; }
	};
	const before = (name, args) => {
		check();
		if (finished || name === 'read' || name === 'length') return;
		if (name === 'readSlice' && Math.max(0, Math.min(length, Number(args[0]) || 0),
			Math.min(length, Number(args[1] ?? length) || 0)) <= cursor) return;
		if (name === 'lineAt' && Math.max(0, Math.min(length, Number(args[0]) || 0)) <= cursor) return;
		const line = Math.max(0, Math.floor(Number(args[0]) || 0));
		if (name === 'lineStart' && line <= totalBreaks || name === 'lineEnd' && line < totalBreaks) return;
		ensureComplete();
	};
	const descriptors = {};
	for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(store))) {
		descriptors[name] = descriptor.get
			? {enumerable: true, get() { before(name, []); return descriptor.get(); }}
			: {enumerable: true, value: (...args) => { before(name, args); return descriptor.value(...args); }};
	}
	descriptors.complete = {enumerable: true, value: complete};
	const pending = Object.freeze(Object.defineProperties({}, descriptors));
	preparation.signal?.addEventListener('abort', cancel, {once: true});
	try {
		check();
		if (cursor < initial.length) advance();
		if (preparation.pending === true) reindex();
		if (cursor === initial.length) finish();
	} catch (error) { fail(error); }
	Promise.resolve().then(async () => {
		try {
			while (!finished) {
				check();
				do { advance(); } while (cursor < initial.length && pieces.length % 4);
				if (preparation.pending === true) reindex();
				preparation.onProgress?.(cursor / initial.length);
				if (cursor === initial.length) finish();
				if (!finished && preparation.yield) await Promise.race([preparation.yield(), complete]);
			}
		} catch (error) { fail(error); }
	});
	return preparation.pending === true ? pending : complete;
}

return Object.freeze({
	create, createAsync: (value, options = {}) => create(value, '', null, options),
	createPending: (value, options = {}) => create(value, '', null, {...options, pending: true}),
	textIntegrity, fnv1a32, rootAfter, contentIdOf, PIECE_CHARS, MAX_BYTES,
	encoder: sourceEncoder,
});

})();
