// The document source store (docs/architecture.md, "editor/source-store.js"): a piece-table string
// store for the canonical Markdown text. length, utf8Bytes, integrity() and rootId are each one pass
// over the whole text; none is needed to paint, so a fresh store computes them on first use (or in
// idle time, via warm()), never eagerly -- hashing and encoding a long document was a tenth of its
// first paint. splice() rewrites the smallest span the edit touched, merging pieces back down and
// keeping a CRLF pair from ever splitting across a piece boundary (a surrogate pair may sit across
// two pieces; the UTF-8 byte accounting reads it whole either way); capture()/
// restore() snapshot and roll back the whole store cheaply (structural sharing of untouched pieces);
// fork() starts a second store already warm with this one's rootId. sourceOffsetFromProjection/
// projectionOffsetFromSource translate between source offsets and the CRLF-collapsed offsets a
// textarea's selection uses (one CRLF pair projects to one caret position).
//
// Pure: every fact this module produces depends only on the strings and offsets it is given -- no
// clock, no DOM, no `rapier` state. That purity is what lets it be the first "engine satellite"
// (docs/audit-ledger.md, "Full R68-10"): globalThis.RapierSourceStore is the only global this file
// introduces (a property assignment, not a new lexical binding), so tools/build.mjs splices this
// file's text, unmodified, at the `/* RAPIER_SOURCE_STORE_MODULE */` slot in editor/engine.js --
// ahead of `rapier.document.source`'s own construction, the first call site -- and engine.js keeps
// its original names as thin aliases (`_rapierCreateSourceStore`, `_rapierTextIntegrity`, `_fnv1a32`,
// `_rapierSourceRootAfter`, `_rapierSourceEncoder`) at the sites the definitions used to occupy, so no
// call site changes; the byte and piece limits stay the store's own (splice refuses past MAX_BYTES). The
// same file, being ordinary script text with no import/export, also loads unmodified in Node
// (`await import('./source-store.js')`, or any script host that defines `globalThis`) for
// tools/check-source-store.mjs, a headless test with no browser and no engine.js around it.
globalThis.RapierSourceStore = (() => {

const MAX_BYTES = 25 * 1024 * 1024;
const sourceEncoder = new TextEncoder();
const PIECE_CHARS = 65536;

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

// A row hash used only to fold a splice into rootId -- not exposed; engine.js's own, unrelated
// _rapierSpliceHash (used for undo-ledger and recovery hashes that have nothing to do with the
// piece table) keeps its own definition and stays out of this module.
function rowHash(value) {
	const fact = textIntegrity(value);
	return fact.chars + ':' + fact.fnv + ':' + fact.adler;
}

function rootAfter(root, row) {
	return rowHash(String(root || '') + ':' + row.pos + ':' +
		rowHash(row.removed) + ':' + rowHash(row.inserted));
}

function create(value, restoredRootId = '', snapshot = null) {
	const initial = String(value == null ? '' : value);
	const buffers = snapshot ? snapshot.buffers.slice() : [initial];
	let bufferChars = buffers.reduce((total, buffer) => total + buffer.length, 0);
	const addBuffer = text => {
		const value = String(text || '');
		bufferChars += value.length;
		return buffers.push(value) - 1;
	};
	let length = snapshot ? snapshot.length : initial.length;
	// The byte count, the root id and the first integrity() answer are one pass each over the whole
	// text; none is needed to paint, so a fresh store computes them on first use (or in idle time,
	// warm()), never on the load path: hashing and encoding 2 MB was a tenth of a long document's
	// first paint. A restored root id is a fact the caller already holds.
	let utf8Bytes = snapshot ? (snapshot.utf8Bytes ?? null) : null;
	let cached = snapshot ? snapshot.cached : initial;

	let cachedIntegrityOf = snapshot ? (snapshot.cachedIntegrityOf ?? null) : null;
	let cachedIntegrityValue = snapshot ? (snapshot.cachedIntegrityValue ?? null) : null;
	let rootId = snapshot ? snapshot.rootId : (restoredRootId || null);
	// The root of the text this store was created with -- the undo window's earliest hash -- kept
	// apart from rootId, which every splice moves on.
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
	const projectedLength = text => {
		// A CRLF pair projects to one character; the pairs are counted natively, not char by char.
		let total = text.length, at = text.indexOf('\r\n');
		while (at !== -1) { total--; at = text.indexOf('\r\n', at + 2); }
		return total;
	};
	const makePiece = (buffer, start, pieceLength) => {
		const text = buffers[buffer].slice(start, start + pieceLength);
		return { buffer, start, length: pieceLength, projected: projectedLength(text) };
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
		: initial ? chunk(0, 0, initial.length) : [];
	let sourceStarts = [], projectionStarts = [], totalProjected = 0;
	const reindex = () => {
		sourceStarts = new Array(pieces.length);
		projectionStarts = new Array(pieces.length);
		let source = 0, projection = 0;
		for (let index = 0; index < pieces.length; index++) {
			sourceStarts[index] = source;
			projectionStarts[index] = projection;
			source += pieces[index].length;
			projection += pieces[index].projected;
		}
		totalProjected = projection;
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
	const merge = rows => {
		const out = [];
		for (const source of rows) {
			if (!source.length) continue;
			const row = { ...source };
			const prior = out[out.length - 1];
			if (prior && prior.length + row.length <= PIECE_CHARS) {
				const text = pieceText(prior) + pieceText(row);
				const buffer = addBuffer(text);
				out[out.length - 1] = makePiece(buffer, 0, text.length);
			} else out.push(row);
		}

		for (let index = 1; index < out.length; index++) {
			const prior = out[index - 1], row = out[index];
			if (buffers[prior.buffer].charCodeAt(prior.start + prior.length - 1) !== 13 ||
					buffers[row.buffer].charCodeAt(row.start) !== 10) continue;
			prior.length--; prior.projected--;
			row.start++; row.length--; row.projected--;
			const buffer = addBuffer('\r\n');
			out.splice(index, 0, makePiece(buffer, 0, 2));
			if (!prior.length) { out.splice(index - 1, 1); index--; }
			if (!row.length) out.splice(index + 1, 1);
		}
		return out.filter(row => row.length);
	};
	const split = offset => {
		const left = [], right = [];
		let cursor = 0;
		for (const piece of pieces) {
			const end = cursor + piece.length;
			if (end <= offset) left.push({ ...piece });
			else if (cursor >= offset) right.push({ ...piece });
			else {
				const cutAt = offset - cursor;
				if (cutAt) left.push(makePiece(piece.buffer, piece.start, cutAt));
				if (cutAt < piece.length) {
					right.push(makePiece(piece.buffer, piece.start + cutAt, piece.length - cutAt));
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
		const text = read();
		if (cachedIntegrityOf !== text) { cachedIntegrityOf = text; cachedIntegrityValue = textIntegrity(text); }
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
	const projectionAtSource = sourceOffset => {
		const offset = Math.max(0, Math.min(length, Number(sourceOffset) || 0));
		if (!pieces.length || offset === length) return totalProjected;
		const index = pieceAt(sourceStarts, offset);
		const local = offset - sourceStarts[index];
		return projectionStarts[index] + projectedLength(pieceText(pieces[index]).slice(0, local));
	};
	const sourceAtProjection = projectionOffset => {
		const offset = Math.max(0, Math.min(totalProjected, Number(projectionOffset) || 0));
		if (!pieces.length || offset === totalProjected) return length;
		const index = pieceAt(projectionStarts, offset);
		const text = pieceText(pieces[index]);
		const target = offset - projectionStarts[index];
		let source = 0, projection = 0;
		while (source < text.length && projection < target) {
			source += text.charCodeAt(source) === 13 && text.charCodeAt(source + 1) === 10 ? 2 : 1;
			projection++;
		}
		return sourceStarts[index] + source;
	};
	const capture = () => {
		const savedBuffers = buffers.slice();
		const savedPieces = pieces.map(piece => ({ ...piece }));
		const savedLength = length, savedBytes = utf8Bytes, savedRoot = rootNow(), savedInitialRoot = initialRootNow();
		let savedText = cached;
		let savedIntegrityOf = cachedIntegrityOf, savedIntegrityValue = cachedIntegrityValue;
		const savedRead = () => {
			if (savedText == null) savedText = savedPieces.map(piece =>
				savedBuffers[piece.buffer].slice(piece.start, piece.start + piece.length)).join('');
			return savedText;
		};
		return Object.freeze({
			rootId: savedRoot,
			read: savedRead,

			integrity() {
				const text = savedRead();
				if (savedIntegrityOf !== text) { savedIntegrityOf = text; savedIntegrityValue = textIntegrity(text); }
				return savedIntegrityValue;
			},
			restore() {
				buffers.length = 0; buffers.push(...savedBuffers);
				bufferChars = savedBuffers.reduce((total, buffer) => total + buffer.length, 0);
				pieces = savedPieces.map(piece => ({ ...piece }));
				length = savedLength; utf8Bytes = savedBytes; cached = savedText; rootId = savedRoot; initialRoot = savedInitialRoot;
				cachedIntegrityOf = savedIntegrityOf; cachedIntegrityValue = savedIntegrityValue;
				reindex();
			},
		});
	};
	const fork = () => create('', rootNow(), {
		buffers, pieces, length, utf8Bytes, cached, rootId, initialRoot: initialRootNow(), cachedIntegrityOf, cachedIntegrityValue,
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
			throw Object.assign(new Error('document is too large (25 MiB maximum)'), {
				code: 'document_too_large',
			});
		}
		const priorRoot = rootNow();
		const [left] = split(at);
		const [, right] = split(at + oldText.length);
		const insertedPieces = newText ? chunk(addBuffer(newText), 0, newText.length) : [];
		pieces = merge(left.concat(insertedPieces, right));
		length += newText.length - oldText.length;
		utf8Bytes = nextBytes;

		if (cached != null) cached = cached.slice(0, at) + newText + cached.slice(at + oldText.length);
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
		return { pos: at, removed: oldText, inserted: newText };
	};
	const warm = () => { rootNow(); bytesNow(); };
	return Object.freeze({
		read, integrity, readSlice, splice, capture, fork, sourceOffsetFromProjection,
		projectionOffsetFromSource, warm,
		get length() { return length; },
		get utf8Bytes() { return bytesNow(); },
		get rootId() { return rootNow(); },
		get initialRootId() { return initialRootNow(); },
	});
}

return Object.freeze({
	create, textIntegrity, fnv1a32, adler32, rootAfter, PIECE_CHARS, MAX_BYTES,
	// The one TextEncoder instance splice()'s byte accounting uses; exposed so engine.js's
	// _rapierSourceEncoder alias (used elsewhere for unrelated byte counts, e.g. the image-asset
	// fold and the recovery ledger) stays the very same object, not a second, merely equivalent one.
	encoder: sourceEncoder,
});

})();
