// RAPIER_SOURCE_STORE_MODULE */` slot in editor/engine.js -- ahead of `rapier.document.source`'s own
globalThis.RapierSourceStore = (() => {

const MAX_BYTES = 64 * 1024 * 1024;
const sourceEncoder = new TextEncoder();
const PIECE_CHARS = 65536;
const MERGE_CHARS = 4096;

function fnv1a32(str) {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
	return (h >>> 0).toString(36);
}

function adler32(value) {
	const text = String(value == null ? '' : value);
	const n = text.length;
	let a = 1, b = 0, i = 0;
	while (i < n) {
		const end = Math.min(n, i + 4096);
		for (; i < end; i++) { a += text.charCodeAt(i); b += a; }
		a %= 65521; b %= 65521;
	}
	return (((b << 16) | a) >>> 0).toString(36);
}

function textIntegrity(value) {
	const text = String(value == null ? '' : value);
	return { chars: text.length, fnv: fnv1a32(text), adler: adler32(text) };
}

function rowHash(value) {
	const fact = textIntegrity(value);
	return fact.chars + ':' + fact.fnv + ':' + fact.adler;
}

function rootAfter(root, row) {
	return rowHash(String(root || '') + ':' + row.pos + ':' +
		rowHash(row.removed) + ':' + rowHash(row.inserted));
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
		if (utf8Bytes == null) utf8Bytes = sourceEncoder.encode(read()).length;
		return utf8Bytes;
	};
	const indexWords = text => {
		const checkpoints = new Uint32Array(Math.ceil(text.length / 1024) + 1), runs = /\S+/g;
		let words = 0, next = 1, match;
		while ((match = runs.exec(text))) {
			while (next * 1024 <= match.index) checkpoints[next++] = words;
			words++;
		}
		while (next < checkpoints.length) checkpoints[next++] = words;
		return {text, checkpoints, words};
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
		const ends = [], crlfEnds = [], projectedEnds = [], lines = /\r\n?|\n/g;
		let match;
		while ((match = lines.exec(text))) {
			ends.push(lines.lastIndex);
			if (match[0].length === 2) {
				crlfEnds.push(lines.lastIndex); projectedEnds.push(lines.lastIndex - crlfEnds.length);
			}
		}
		const wordIndex = indexWords(text);
		return { buffer, start, length: pieceLength, projected: pieceLength - crlfEnds.length, breaks: ends.length,
			lineEnds: new Uint32Array(ends), crlfEnds: new Uint32Array(crlfEnds), projectedEnds: new Uint32Array(projectedEnds),
			wordIndex, wordOffset: 0, words: wordIndex.words, headWord: /^\S/.test(text), tailWord: /\S$/.test(text) };
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
	let sourceStarts = [], projectionStarts = [], breakStarts = [], totalProjected = 0, totalBreaks = 0, totalWords = 0;
	const reindex = () => {
		sourceStarts = new Array(pieces.length);
		projectionStarts = new Array(pieces.length);
		breakStarts = new Array(pieces.length);
		let source = 0, projection = 0, breaks = 0, words = 0, tailWord = false;
		for (let index = 0; index < pieces.length; index++) {
			sourceStarts[index] = source;
			projectionStarts[index] = projection;
			breakStarts[index] = breaks;
			source += pieces[index].length;
			projection += pieces[index].projected;
			breaks += pieces[index].breaks;
			words += pieces[index].words - (tailWord && pieces[index].headWord ? 1 : 0);
			tailWord = pieces[index].tailWord;
		}
		totalProjected = projection;
		totalBreaks = breaks;
		totalWords = words;
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
			tailWord: end > start && /\S/.test(index.text[stop - 1])};
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
		const left = [], right = [];
		let cursor = 0;
		for (const piece of pieces) {
			const end = cursor + piece.length;
			if (end <= start) left.push(piece);
			else if (cursor >= stop) right.push(piece);
			else {
				if (cursor < start) left.push(slicePiece(piece, 0, start - cursor));
				if (stop < end) {
					const cutAt = stop - cursor;
					right.push(slicePiece(piece, cutAt, piece.length));
				}
			}
			cursor = end;
		}
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
		if (signal?.aborted) throw Object.assign(new Error('Cancelled'), {name: 'AbortError'});
		if (cachedIntegrityKey === cacheKey) return cachedIntegrityValue;
		const pending = pieces, chars = length;
		let fnv = 0x811c9dc5, a = 1, b = 0, processed = 0;
		for (const piece of pending) {
			const text = buffers[piece.buffer], end = piece.start + piece.length;
			for (let start = piece.start; start < end;) {
				const stop = Math.min(end, start + PIECE_CHARS);
				for (let at = start; at < stop;) {
					const bound = Math.min(stop, at + 4096);
					for (; at < bound; at++) {
						const code = text.charCodeAt(at);
						fnv = Math.imul(fnv ^ code, 16777619); a += code; b += a;
					}
					a %= 65521; b %= 65521;
				}
				processed += stop - start; start = stop;
				onProgress?.(processed / chars);
				if (yieldWork && processed < chars) await yieldWork();
				if (signal?.aborted) throw Object.assign(new Error('Cancelled'), {name: 'AbortError'});
				if (pieces !== pending) return null;
			}
		}
		cachedIntegrityKey = cacheKey;
		cachedIntegrityValue = {chars, fnv: (fnv >>> 0).toString(36), adler: (((b << 16) | a) >>> 0).toString(36)};
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
	const capture = () => {
		const savedBuffers = buffers.slice();
		const savedPieces = pieces.map(piece => ({ ...piece }));
		const savedPresence = Array.from(presence, ([key, entry]) => [key, {...entry}]);
		const savedCacheKey = cacheKey;
		const savedLength = length, savedBytes = utf8Bytes, savedRoot = rootNow(), savedInitialRoot = initialRootNow();
		let savedText = cached;
		let savedIntegrityValue = cachedIntegrityKey === savedCacheKey ? cachedIntegrityValue : null;
		const savedRead = () => {
			if (savedText == null) savedText = savedPieces.map(piece =>
				savedBuffers[piece.buffer].slice(piece.start, piece.start + piece.length)).join('');
			return savedText;
		};
		return Object.freeze({
			rootId: savedRoot,
			read: savedRead,

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
				cachedIntegrityValue = savedIntegrityValue;
				cachedIntegrityKey = savedIntegrityValue == null ? null : savedCacheKey;
				presence.clear();
				for (const [key, entry] of savedPresence) presence.set(key, {...entry});
				reindex();
			},
		});
	};
	const fork = () => create('', rootNow(), {
		buffers, pieces, length, utf8Bytes, cached, rootId, cacheKey, initialRoot: initialRootNow(), cachedIntegrityKey, cachedIntegrityValue,
		presence: Array.from(presence, ([key, entry]) => [key, {...entry}]),
	});
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
	const splice = (start, removed, inserted) => {
		const at = Number(start);
		const oldText = String(removed == null ? '' : removed);
		const newText = String(inserted == null ? '' : inserted);
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
		rootId = rootAfter(priorRoot, { pos: at, removed: oldText, inserted: newText });
		cacheKey = Object.freeze({});
		return { pos: at, removed: oldText, inserted: newText };
	};
	const measureBytesAsync = async ({yield: yieldWork, signal, onProgress} = {}) => {
		if (signal?.aborted) throw Object.assign(new Error('Cancelled'), {name: 'AbortError'});
		if (utf8Bytes != null) return utf8Bytes;
		const pending = cacheKey;
		const text = read();
		let bytes = 0;
		for (let start = 0; start < text.length;) {
			if (signal?.aborted) throw Object.assign(new Error('Cancelled'), {name: 'AbortError'});
			let end = Math.min(text.length, start + PIECE_CHARS);
			if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 &&
					text.charCodeAt(end - 1) <= 0xdbff && text.charCodeAt(end) >= 0xdc00 &&
					text.charCodeAt(end) <= 0xdfff) end++;
			bytes += sourceEncoder.encode(text.slice(start, end)).length;
			start = end;
			onProgress?.(start / text.length);
			if (yieldWork && start < text.length) await yieldWork();
			if (cacheKey !== pending) return null;
		}
		if (signal?.aborted) throw Object.assign(new Error('Cancelled'), {name: 'AbortError'});
		if (cacheKey !== pending) return null;
		utf8Bytes = bytes;
		return bytes;
	};
	const warm = () => { rootNow(); bytesNow(); };
	const warmAsync = async ({yield: yieldWork, signal, onProgress} = {}) => {
		if (signal?.aborted) throw Object.assign(new Error('Cancelled'), {name: 'AbortError'});
		if (cachedIntegrityKey === cacheKey && utf8Bytes != null && rootId != null) return true;
		const pending = cacheKey;
		const text = read();
		const countBytes = utf8Bytes == null;
		let fnv = 0x811c9dc5, a = 1, b = 0, bytes = countBytes ? 0 : utf8Bytes;
		for (let start = 0; start < text.length;) {
			if (signal?.aborted) throw Object.assign(new Error('Cancelled'), {name: 'AbortError'});
			let end = Math.min(text.length, start + PIECE_CHARS);
			if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 &&
					text.charCodeAt(end - 1) <= 0xdbff && text.charCodeAt(end) >= 0xdc00 &&
					text.charCodeAt(end) <= 0xdfff) end++;
			for (let at = start; at < end;) {
				const stop = Math.min(end, at + 4096);
				for (; at < stop; at++) {
					const code = text.charCodeAt(at);
					if (countBytes) bytes += code < 0x80 ? 1 : code < 0x800 ? 2
						: (code & 0xfc00) === 0xdc00 && at > 0 && (text.charCodeAt(at - 1) & 0xfc00) === 0xd800 ? 1 : 3;
					fnv = Math.imul(fnv ^ code, 16777619);
					a += code; b += a;
				}
				a %= 65521; b %= 65521;
			}
			start = end;
			if (onProgress) onProgress(start / text.length);
			if (yieldWork) await yieldWork();
			if (cacheKey !== pending) return false;
		}
		if (signal?.aborted) throw Object.assign(new Error('Cancelled'), {name: 'AbortError'});
		if (cacheKey !== pending) return false;
		cachedIntegrityKey = pending;
		cachedIntegrityValue = {chars: text.length, fnv: (fnv >>> 0).toString(36), adler: (((b << 16) | a) >>> 0).toString(36)};
		utf8Bytes = bytes;
		rootNow();
		return true;
	};
	const store = Object.freeze({
		read, integrity, integrityAsync, readSlice, contains, splice, capture, fork, lineAt, lineStart, lineEnd, sourceOffsetFromProjection,
		projectionOffsetFromSource, warm, warmAsync, measureBytesAsync,
		get length() { return length; },
		get lineCount() { return totalBreaks + 1; },
		get wordCount() { return totalWords; },
		get utf8Bytes() { return bytesNow(); },
		get rootId() { return rootNow(); },
		get cacheKey() { return cacheKey; },
		get initialRootId() { return initialRootNow(); },
	});
	if (!preparation) return store;
	return (async () => {
		const check = () => {
			if (preparation.signal?.aborted) throw Object.assign(new Error('Cancelled'), {name: 'AbortError'});
		};
		check();
		let fnv = 0x811c9dc5, a = 1, b = 0, bytes = 0;
		for (let at = 0; at < initial.length;) {
			let end = Math.min(initial.length, at + PIECE_CHARS);
			if (end < initial.length && initial.charCodeAt(end - 1) === 13 && initial.charCodeAt(end) === 10) end++;
			pieces.push(makePiece(0, at, end - at));
			for (; at < end;) {
				const stop = Math.min(end, at + 4096);
				for (; at < stop; at++) {
					const code = initial.charCodeAt(at);
					fnv = Math.imul(fnv ^ code, 16777619); a += code; b += a;
					bytes += code < 0x80 ? 1 : code < 0x800 ? 2
						: (code & 0xfc00) === 0xdc00 && at > 0 && (initial.charCodeAt(at - 1) & 0xfc00) === 0xd800 ? 1 : 3;
				}
				a %= 65521; b %= 65521;
			}
			preparation.onProgress?.(at / initial.length);
			if (preparation.yield) await preparation.yield();
			check();
		}
		utf8Bytes = bytes;
		cachedIntegrityKey = cacheKey;
		cachedIntegrityValue = {chars: length, fnv: (fnv >>> 0).toString(36), adler: (((b << 16) | a) >>> 0).toString(36)};
		rootNow();
		reindex();
		return store;
	})();
}

return Object.freeze({
	create, createAsync: (value, options = {}) => create(value, '', null, options),
	textIntegrity, fnv1a32, adler32, rootAfter, PIECE_CHARS, MAX_BYTES,
	encoder: sourceEncoder,
});

})();
