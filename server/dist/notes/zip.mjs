import {crc32} from '../images/crc32.mjs';
import {attachmentSizeWords} from './size-words.mjs';
import {zipStored} from './zip-records.mjs';
// The published RapierNotesZip keeps the writer's name; the writer itself is zip-records.mjs.
export {crc32, zipStored};
// Pure archive reader; refuses what it does not carry rather than parse it partially.

// ---- Reading: stored and deflate (DecompressionStream('deflate-raw')) only; other methods refused by name. ZIP64 refused (locator and sentinels).
// Declared sizes are summed against ZIP_READ_MAX_BYTES before inflating; the inflate loop aborts past an entry's declared size.
export const ZIP_READ_MAX_BYTES = 512 * 1024 * 1024;
// 0xffff is ZIP64's sentinel, not a usable classic-ZIP count. One policy for every source.
export const ZIP_MAX_ENTRIES = 0xffff - 1;
export const ZIP_WRITE_METADATA_BYTES = 32 * 1024 * 1024;
// The writer charges 2*UTF8(path)+256 per input; the scanner charges UTF8(path)+64.
// Half the writer's directory allowance admits every directory it can write, including the
// generated manifest record. This is an accounting budget, not a JavaScript heap-size claim.
export const ZIP_METADATA_BYTES = ZIP_WRITE_METADATA_BYTES / 2;
export const zipAdmissionError = (budget, message) => Object.assign(new Error(message), {zipBudget: budget});

function findEndRecord(bytes, view) {
	for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xFFFF); i--) {
		if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) return i;
	}
	throw new Error('readZip: no end-of-central-directory record found; this is not a zip file');
}

function checkExtra(bytes, start, length, name) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = start + length;
	for (let at = start; at < end;) {
		if (at + 4 > end) throw new Error(`readZip: "${name}" has a truncated extra field`);
		const id = view.getUint16(at, true), size = view.getUint16(at + 2, true);
		if (id === 1) throw new Error(`readZip: "${name}" uses ZIP64, which this reader does not support`);
		at += 4 + size;
		if (at > end) throw new Error(`readZip: "${name}" has a truncated extra field`);
	}
}
function equalBytes(a, b) { return a.length === b.length && a.every((value, i) => value === b[i]); }

// One admission owner, driven synchronously for bytes or asynchronously for file ranges.
function* scanZip(length, {maxBytes = ZIP_READ_MAX_BYTES, maxEntries = ZIP_MAX_ENTRIES, maxMetadataBytes = ZIP_METADATA_BYTES} = {}) {
	if (![maxBytes, maxEntries, maxMetadataBytes].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('readZip: admission bounds must be nonnegative safe integers');
	maxMetadataBytes = Math.min(maxMetadataBytes, ZIP_METADATA_BYTES);
	const byteLimit = Math.min(maxBytes, ZIP_READ_MAX_BYTES), entryLimit = Math.min(maxEntries, ZIP_MAX_ENTRIES);
	if (length < 22) throw new Error('readZip: too short to be a zip file');
	const tailAt = Math.max(0, length - 22 - 65535 - 20), tail = yield [tailAt, length - tailAt];
	const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength), end = findEndRecord(tail, tv), eocd = tailAt + end;
	if (eocd >= 20 && tv.getUint32(end - 20, true) === 0x07064b50) throw new Error('readZip: this archive uses ZIP64, which this reader does not support');
	const total = tv.getUint16(end + 10, true), cdSize = tv.getUint32(end + 12, true), cdOffset = tv.getUint32(end + 16, true);
	if (total === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) throw new Error('readZip: this archive uses ZIP64, which this reader does not support');
	if (total > entryLimit) throw zipAdmissionError('entries', `readZip: ${total} entries exceed the ${entryLimit}-entry admission bound`);
	if (tv.getUint16(end + 4, true) || tv.getUint16(end + 6, true)) throw new Error('readZip: split archives are not supported');
	if (tv.getUint16(end + 8, true) !== total) throw new Error('readZip: the file counts disagree');
	if (cdOffset + cdSize !== eocd) throw new Error('readZip: the central directory is truncated or has an inconsistent size');
	const dec = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}), records = [], names = new Set();
	let budget = byteLimit, at = cdOffset, metadata = 0;
	for (let i = 0; i < total; i++) {
		if (at + 46 > eocd) throw new Error(`readZip: bad central directory entry at index ${i}`);
		const central = yield [at, 46], cv = new DataView(central.buffer, central.byteOffset, central.byteLength);
		if (cv.getUint32(0, true) !== 0x02014b50) throw new Error(`readZip: bad central directory entry at index ${i}`);
		const flags = cv.getUint16(8, true), method = cv.getUint16(10, true), crc = cv.getUint32(16, true);
		const compSize = cv.getUint32(20, true), size = cv.getUint32(24, true);
		const nameLen = cv.getUint16(28, true), extraLen = cv.getUint16(30, true), commentLen = cv.getUint16(32, true);
		const localOffset = cv.getUint32(42, true), next = at + 46 + nameLen + extraLen + commentLen;
		if (next > eocd) throw new Error(`readZip: central directory entry at index ${i} is truncated`);
		const extra = yield [at + 46, nameLen + extraLen], nameBytes = extra.subarray(0, nameLen);
		let name;
		try { name = dec.decode(nameBytes); } catch (_) { throw new Error(`readZip: entry ${i} has a name that is not UTF-8`); }
		// An empty interior segment is refused; a trailing one is a directory entry.
		if (!name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').some((part, n, list) => part === '..' || part === '.' || !part && n !== list.length - 1)) throw new Error(`readZip: "${name}" is not a safe relative name`);
		if (names.has(name)) throw new Error(`readZip: duplicate entry "${name}"`);
		names.add(name);
		if (compSize === 0xFFFFFFFF || size === 0xFFFFFFFF || localOffset === 0xFFFFFFFF) throw new Error(`readZip: "${name}" uses ZIP64, which this reader does not support`);
		if (cv.getUint16(34, true)) throw new Error(`readZip: "${name}" belongs to a split archive`);
		if (flags & ~0x080E) throw new Error(`readZip: "${name}" uses unsupported or encrypted flags`);
		if (method !== 0 && method !== 8) throw new Error(`readZip: "${name}" uses compression method ${method}, which this reader does not support (only stored and deflate)`);
		if (size > budget) throw zipAdmissionError('bytes', `"${name}" is listed as ${attachmentSizeWords(size)}; the archive size limit is ${attachmentSizeWords(byteLimit)}. Export fewer files at a time.`);
		budget -= size;
		checkExtra(extra, nameLen, extraLen, name);
		if (localOffset + 30 > cdOffset) throw new Error(`readZip: "${name}" has no valid local header`);
		const local = yield [localOffset, 30], lv = new DataView(local.buffer, local.byteOffset, local.byteLength);
		if (lv.getUint32(0, true) !== 0x04034b50) throw new Error(`readZip: "${name}" has no valid local header`);
		const localNameLen = lv.getUint16(26, true), localExtraLen = lv.getUint16(28, true);
		const dataStart = localOffset + 30 + localNameLen + localExtraLen, dataEnd = dataStart + compSize;
		if (dataEnd > cdOffset) throw new Error(`readZip: "${name}" is truncated before the central directory`);
		const localExtra = yield [localOffset + 30, localNameLen + localExtraLen];
		if (flags !== lv.getUint16(6, true) || method !== lv.getUint16(8, true) || cv.getUint16(6, true) !== lv.getUint16(4, true)
			|| cv.getUint32(12, true) !== lv.getUint32(10, true) || !equalBytes(nameBytes, localExtra.subarray(0, localNameLen))) throw new Error(`readZip: "${name}" has a local header that disagrees with its central directory`);
		checkExtra(localExtra, localNameLen, localExtraLen, name);
		const localFields = [lv.getUint32(14, true), lv.getUint32(18, true), lv.getUint32(22, true)], expected = [crc, compSize, size];
		if (localFields.some((value, j) => value !== expected[j] && (!(flags & 8) || value !== 0))) throw new Error(`readZip: "${name}" has CRC or sizes that disagree between headers`);
		let localEnd = dataEnd;
		if (flags & 8) {
			const descriptor = yield [dataEnd, Math.min(16, cdOffset - dataEnd)], dv = new DataView(descriptor.buffer, descriptor.byteOffset, descriptor.byteLength);
			const matches = start => start + 12 <= descriptor.length && expected.every((value, j) => dv.getUint32(start + j * 4, true) === value);
			if (descriptor.length >= 4 && dv.getUint32(0, true) === 0x08074b50 && matches(4)) localEnd += 16;
			else if (matches(0)) localEnd += 12;
			else throw new Error(`readZip: "${name}" has a missing or inconsistent data descriptor`);
		}
		records.push({name, crc, method, size, compSize, localOffset, localEnd, dataStart});
		metadata += nameLen + 64;
		if (metadata > maxMetadataBytes) throw zipAdmissionError('metadata', `"${name}" puts the archive's file list over ${attachmentSizeWords(maxMetadataBytes)}. Export fewer files at a time.`);
		at = next;
	}
	if (at !== eocd) throw new Error('readZip: the file count or central directory size does not match its entries');
	const ordered = records.slice().sort((a, b) => a.localOffset - b.localOffset);
	for (let i = 1; i < ordered.length; i++) if (ordered[i].localOffset < ordered[i - 1].localEnd) throw new Error(`readZip: "${ordered[i].name}" overlaps another entry`);
	return records;
}

// [{name, bytes}] in central-directory order; the archive bound holds.
export async function readZip(bytes, {maxBytes = ZIP_READ_MAX_BYTES, maxEntries = ZIP_MAX_ENTRIES} = {}) {
	// Admission still precedes byte coercion, including for an invalid caller value.
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || !Number.isSafeInteger(maxEntries) || maxEntries < 0) throw new Error('readZip: admission bounds must be nonnegative safe integers');
	const entries = [];
	for await (const entry of entriesOf(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {maxBytes, maxEntries}, Infinity)) entries.push({name: entry.name, bytes: await entry.read()});
	return entries;
}


// House asset bound: spec/md-assets.mjs IMAGE_LIMITS.bytes (#256's memory policy).
export const ZIP_ENTRY_MEMORY_BYTES = 16 * 1024 * 1024;
export const ZIP_IO_BYTES = 64 * 1024;
const zipAbort = signal => { if (signal?.aborted) throw signal.reason || new Error('readZip: cancelled'); };

function rangedSource(value) {
	if (value instanceof ArrayBuffer) value = new Uint8Array(value);
	if (value instanceof Uint8Array) return {size:value.length, read:async (at, size) => value.subarray(at, at + size)};
	if (!value || !Number.isSafeInteger(value.size) || value.size < 0) throw new TypeError('readZip: source needs a safe size and range reader');
	if (typeof value.read === 'function') return value;
	if (typeof value.slice === 'function') return {size:value.size, read:async (at, size) => new Uint8Array(await value.slice(at, at + size).arrayBuffer())};
	throw new TypeError('readZip: source needs a safe size and range reader');
}
async function takeRange(source, at, length, signal) {
	zipAbort(signal);
	if (!Number.isSafeInteger(at) || !Number.isSafeInteger(length) || at < 0 || length < 0 || at + length > source.size) throw new Error('readZip: source range is outside the archive');
	const bytes = await source.read(at, length); zipAbort(signal);
	if (!(bytes instanceof Uint8Array) || bytes.length !== length) throw new Error('readZip: source range was truncated');
	return bytes;
}
async function* compressedChunks(source, record, signal) {
	for (let at = 0; at < record.compSize; at += ZIP_IO_BYTES) yield await takeRange(source, record.dataStart + at, Math.min(ZIP_IO_BYTES, record.compSize - at), signal);
}
function zipSizeMismatch(name, actual, declared) {
	return new Error(`"${name}" has a size mismatch: ${attachmentSizeWords(actual)}, expected ${attachmentSizeWords(declared)}. Make a new export and try again.`);
}
async function decodeRecord(source, record, {signal}) {
	const {name, size, method, crc} = record;
	zipAbort(signal);
	const out = new Uint8Array(size); let length = 0;
	const accept = part => {
		zipAbort(signal);
		if (length + part.length > size) throw new Error(`readZip: "${name}" inflated past its declared size; refused as a probable zip bomb`);
		out.set(part, length); length += part.length;
	};
	if (method === 0) {
		if (record.compSize !== size) throw zipSizeMismatch(name, record.compSize, size);
		for await (const part of compressedChunks(source, record, signal)) accept(part);
	} else {
		const stream = new DecompressionStream('deflate-raw'), writer = stream.writable.getWriter(), reader = stream.readable.getReader();
		const feed = (async () => {
			try { for await (const part of compressedChunks(source, record, signal)) await writer.write(part); await writer.close(); }
			catch (error) { await writer.abort(error).catch(() => {}); throw error; }
		})();
		feed.catch(() => {});
		try {
			for (;;) {
				let step;
				try { step = await reader.read(); } catch (error) { throw new Error(`readZip: "${name}" could not be inflated (${error?.message || error})`); }
				if (step.done) break;
				accept(step.value);
			}
			await feed;
		} finally {
			await Promise.allSettled([reader.cancel(), writer.abort()]); await feed.catch(() => {});
			reader.releaseLock(); writer.releaseLock();
		}
	}
	if (length !== size) throw zipSizeMismatch(name, length, size);
	if (crc32(out) !== crc) throw new Error(`readZip: "${name}" failed CRC-32 verification`);
	return out;
}

// Metadata first; consumers can skip a payload entirely. Only read() allocates an entry.
export async function* zipEntries(value, options = {}) {
	const {maxEntryBytes = ZIP_ENTRY_MEMORY_BYTES, maxMetadataBytes = ZIP_METADATA_BYTES} = options;
	if (![maxEntryBytes, maxMetadataBytes].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('readZip: memory bounds must be nonnegative safe integers');
	yield* entriesOf(value, options, Math.min(maxEntryBytes, ZIP_ENTRY_MEMORY_BYTES));
}
// zipEntries bounds members by the house number; readZip by the archive's bound.
async function* entriesOf(value, options, entryLimit) {
	const {maxMetadataBytes = ZIP_METADATA_BYTES, signal} = options;
	const source = rangedSource(value), scan = scanZip(source.size, {...options, maxMetadataBytes}); let step = scan.next();
	while (!step.done) { step = scan.next(await takeRange(source, ...step.value, signal)); }
	for (const record of step.value) {
		zipAbort(signal);
		if (record.method === 0 && record.compSize !== record.size) throw zipSizeMismatch(record.name, record.compSize, record.size);
		const oversize = record.size > entryLimit;
		const entry = {name:record.name, size:record.size};
		if (oversize) entry.oversize = true;
		else entry.read = () => decodeRecord(source, record, {signal});
		// Stored containers can be traversed in ranges without allocating their member-sized body.
		if (!oversize || record.method === 0) entry.source = async () => {
			zipAbort(signal);
			if (record.method !== 0) return rangedSource(await decodeRecord(source, record, {signal}));
			if (record.compSize !== record.size) throw zipSizeMismatch(record.name, record.compSize, record.size);
			let crc = 0; for await (const part of compressedChunks(source, record, signal)) crc = crc32(part, crc);
			if (crc !== record.crc) throw new Error(`readZip: "${record.name}" failed CRC-32 verification`);
			return {size:record.size, read:(at, size) => {
				if (!Number.isSafeInteger(at) || !Number.isSafeInteger(size) || at < 0 || size < 0 || at + size > record.size) return Promise.reject(new Error('readZip: source range is outside the archive'));
				return takeRange(source, record.dataStart + at, size, signal);
			}};
		};
		yield entry;
	}
}
export async function* readZipEntries(source, options = {}) {
	for await (const entry of zipEntries(source, options)) {
		if (entry.oversize) yield {name:entry.name, size:entry.size, oversize:true};
		else yield {name:entry.name, bytes:await entry.read()};
	}
}

export function zipOversizeSkip(entry) {
	const archivePath = entry.archivePath?.slice(), label = [...(archivePath || []), entry.name].join('!');
	return {name:entry.name, size:entry.size, byteLength:entry.size, oversize:true,
		rootId:entry.rootId ?? '', ...(archivePath ? {archivePath} : {}),
		why:`"${label}" is ${attachmentSizeWords(entry.size)}, over the ${attachmentSizeWords(ZIP_ENTRY_MEMORY_BYTES)} limit here. Keep the source archive.`};
}
