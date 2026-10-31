import {crc32} from '../images/crc32.mjs';
import {attachmentSizeWords} from './size-words.mjs';
export {crc32};

export const ZIP_READ_MAX_BYTES = 512 * 1024 * 1024;
export const ZIP_MAX_ENTRIES = 0xffff - 1;
export const ZIP_WRITE_METADATA_BYTES = 32 * 1024 * 1024;
export const ZIP_METADATA_BYTES = ZIP_WRITE_METADATA_BYTES / 2;
export const zipAdmissionError = (budget, message) => Object.assign(new Error(message), {zipBudget: budget});

function zipLimits(options = {}) {
	const maxBytes = options.maxBytes ?? ZIP_READ_MAX_BYTES, maxEntries = options.maxEntries ?? ZIP_MAX_ENTRIES;
	const maxMetadataBytes = options.maxMetadataBytes ?? ZIP_METADATA_BYTES;
	return {maxBytes, maxEntries, maxMetadataBytes, zip64: options.zip64 !== false, errors: options.errors === 'archive' ? 'archive' : 'notes',
		maxNameBytes: options.maxNameBytes ?? Infinity, rejectEmpty: !!options.rejectEmpty, contiguous: !!options.contiguous,
		versionMax: options.versionMax ?? Infinity, paths: options.paths === 'archive' ? 'archive' : 'notes', fileTypes: !!options.fileTypes,
		utf8Required: !!options.utf8Required, capCompressed: !!options.capCompressed, matchTime: options.matchTime !== false && options.errors !== 'archive'};
}
function zipError(limits, archiveCode, notesMessage) { throw new Error(limits.errors === 'archive' ? archiveCode : notesMessage); }
const archiveEncoder = new TextEncoder();
const archiveDecoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
export function archivePathName(name, maxNameBytes) {
	if (typeof name !== 'string' || !name || name.length > maxNameBytes ||
			/^[\/]/.test(name) || /[\\:\u0000-\u001f\u007f]/.test(name) || /%(?:00|2e|2f|5c)/i.test(name)) throw new Error('archive_path_invalid');
	const directory = name.endsWith('/'), path = directory ? name.slice(0, -1) : name;
	if (!path || path.split('/').some(part => !part || part === '.' || part === '..' || /[ .]$/.test(part))) throw new Error('archive_path_invalid');
	const encoded = archiveEncoder.encode(name);
	if (encoded.length > maxNameBytes) throw new Error('archive_path_limit');
	if (archiveDecoder.decode(encoded) !== name) throw new Error('archive_filename_invalid');
	return {name, directory, key: path.normalize('NFC').toLowerCase()};
}
export function archivePathRegistry() {
	const explicit = new Map(), parents = new Set();
	return entry => {
		if (explicit.has(entry.key) || !entry.directory && parents.has(entry.key)) throw new Error('archive_path_collision');
		let at = entry.key.indexOf('/');
		while (at >= 0) {
			const parent = entry.key.slice(0, at);
			if (explicit.has(parent) && !explicit.get(parent)) throw new Error('archive_path_collision');
			parents.add(parent);
			at = entry.key.indexOf('/', at + 1);
		}
		explicit.set(entry.key, entry.directory);
	};
}

function findEndRecord(bytes, view, limits) {
	for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xFFFF); i--) {
		if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) return i;
	}
	zipError(limits, 'archive_zip_directory_missing', 'readZip: no end-of-central-directory record found; this is not a zip file');
}

function checkExtra(bytes, start, length, name, limits) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = start + length;
	let zip64 = null;
	for (let at = start; at < end;) {
		if (at + 4 > end) zipError(limits, 'archive_zip_extra_invalid', `readZip: "${name}" has a truncated extra field`);
		const id = view.getUint16(at, true), size = view.getUint16(at + 2, true);
		if (at + 4 + size > end) zipError(limits, 'archive_zip_extra_invalid', `readZip: "${name}" has a truncated extra field`);
		if (id === 1) {
			if (!limits.zip64) zipError(limits, 'archive_zip64_unsupported', `readZip: "${name}" uses ZIP64`);
			if (zip64) throw new Error(`readZip: "${name}" has a duplicate ZIP64 extra field`);
			zip64 = bytes.subarray(at + 4, at + 4 + size);
		}
		at += 4 + size;
	}
	return zip64;
}
function zip64Fields(fields, extra, name, local = false) {
	const keys = local ? ['size', 'compSize'] : ['size', 'compSize', 'localOffset', 'disk'];
	const required = keys.filter(key => fields[key] === (key === 'disk' ? 0xFFFF : 0xFFFFFFFF));
	if (required.length && !extra) throw new Error(`readZip: "${name}" is missing ZIP64 size or offset information`);
	if (!extra) return fields;
	const length = required.reduce((sum, key) => sum + (key === 'disk' ? 4 : 8), 0);
	if (!length || extra.length !== length || local && required.length !== 2) throw new Error(`readZip: "${name}" has an inconsistent ZIP64 extra field length`);
	const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength), resolved = {...fields};
	let at = 0;
	for (const key of required) {
		if (key === 'disk') { resolved[key] = view.getUint32(at, true); at += 4; continue; }
		const low = view.getUint32(at, true), high = view.getUint32(at + 4, true);
		if (high > 0x1FFFFF) throw new Error(`readZip: "${name}" has a ZIP64 value outside the safe integer range`);
		resolved[key] = high * 0x100000000 + low; at += 8;
	}
	return resolved;
}
function equalBytes(a, b) { return a.length === b.length && a.every((value, i) => value === b[i]); }

function* scanZip(length, options = {}) {
	const limits = zipLimits(options);
	const {maxBytes, maxEntries, zip64} = limits;
	let {maxMetadataBytes} = limits;
	if (![maxBytes, maxEntries, maxMetadataBytes].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('readZip: admission bounds must be nonnegative safe integers');
	maxMetadataBytes = Math.min(maxMetadataBytes, ZIP_METADATA_BYTES);
	const byteLimit = Math.min(maxBytes, ZIP_READ_MAX_BYTES), entryLimit = Math.min(maxEntries, ZIP_MAX_ENTRIES);
	if (length < 22) zipError(limits, 'archive_byte_limit', 'readZip: too short to be a zip file');
	const tailAt = Math.max(0, length - 22 - 65535 - 20), tail = yield [tailAt, length - tailAt];
	const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength), end = findEndRecord(tail, tv, limits), eocd = tailAt + end;
	if (eocd >= 20 && tv.getUint32(end - 20, true) === 0x07064b50) zipError(limits, 'archive_zip64_unsupported', 'readZip: this archive uses ZIP64, which this reader does not support');
	const total = tv.getUint16(end + 10, true), cdSize = tv.getUint32(end + 12, true), cdOffset = tv.getUint32(end + 16, true);
	if (total === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) zipError(limits, 'archive_zip64_unsupported', 'readZip: this archive uses ZIP64, which this reader does not support');
	if (limits.rejectEmpty && !total || total > entryLimit) {
		if (limits.errors === 'archive') throw new Error('archive_entry_limit');
		throw zipAdmissionError('entries', `readZip: ${total} entries exceed the ${entryLimit}-entry admission bound`);
	}
	if (tv.getUint16(end + 4, true) || tv.getUint16(end + 6, true)) zipError(limits, 'archive_multidisk_unsupported', 'readZip: split archives are not supported');
	if (tv.getUint16(end + 8, true) !== total) zipError(limits, 'archive_multidisk_unsupported', 'readZip: the file counts disagree');
	if (cdOffset + cdSize !== eocd) zipError(limits, 'archive_zip_directory_invalid', 'readZip: the central directory is truncated or has an inconsistent size');
	const dec = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}), records = [], names = new Set(), paths = limits.paths === 'archive' ? archivePathRegistry() : null;
	let budget = byteLimit, at = cdOffset, metadata = 0;
	for (let i = 0; i < total; i++) {
		if (at + 46 > eocd) zipError(limits, 'archive_zip_directory_invalid', `readZip: bad central directory entry at index ${i}`);
		const central = yield [at, 46], cv = new DataView(central.buffer, central.byteOffset, central.byteLength);
		if (cv.getUint32(0, true) !== 0x02014b50) zipError(limits, 'archive_zip_directory_invalid', `readZip: bad central directory entry at index ${i}`);
		const flags = cv.getUint16(8, true), method = cv.getUint16(10, true), crc = cv.getUint32(16, true);
		const rawCompSize = cv.getUint32(20, true), rawSize = cv.getUint32(24, true);
		const nameLen = cv.getUint16(28, true), extraLen = cv.getUint16(30, true), commentLen = cv.getUint16(32, true);
		const next = at + 46 + nameLen + extraLen + commentLen;
		if (limits.versionMax < Infinity && cv.getUint16(6, true) > limits.versionMax) zipError(limits, 'archive_zip_features_unsupported', `readZip: entry ${i} uses an unsupported ZIP version`);
		if (!zip64 && cv.getUint16(34, true)) zipError(limits, 'archive_zip_features_unsupported', `readZip: entry ${i} belongs to a split archive`);
		if (next > eocd) zipError(limits, 'archive_zip_directory_invalid', `readZip: central directory entry at index ${i} is truncated`);
		if (nameLen > limits.maxNameBytes) zipError(limits, 'archive_path_limit', `readZip: entry ${i} has a name past the name cap`);
		const extra = yield [at + 46, nameLen + extraLen], nameBytes = extra.subarray(0, nameLen);
		if (limits.utf8Required && !(flags & 0x0800) && nameBytes.some(byte => byte > 127)) zipError(limits, 'archive_filename_encoding_unsupported', `readZip: entry ${i} has a name that is not UTF-8`);
		let name;
		try { name = dec.decode(nameBytes); } catch (error) {
			if (limits.errors === 'archive' && error instanceof TypeError) throw new Error('archive_filename_invalid');
			throw new Error(`readZip: entry ${i} has a name that is not UTF-8`);
		}
		let directory = name.endsWith('/');
		if (paths) {
			const parsed = archivePathName(name, limits.maxNameBytes);
			paths(parsed); name = parsed.name; directory = parsed.directory;
		} else {
			if (!name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').some((part, n, list) => part === '..' || part === '.' || !part && n !== list.length - 1)) throw new Error(`readZip: "${name}" is not a safe relative name`);
			if (names.has(name)) throw new Error(`readZip: duplicate entry "${name}"`);
			names.add(name);
		}
		const central64 = checkExtra(extra, nameLen, extraLen, name, limits);
		let compSize = rawCompSize, size = rawSize, localOffset = cv.getUint32(42, true), disk = cv.getUint16(34, true);
		if (!zip64 && (central64 || compSize === 0xFFFFFFFF || size === 0xFFFFFFFF || localOffset === 0xFFFFFFFF)) zipError(limits, 'archive_zip64_unsupported', `readZip: "${name}" uses ZIP64`);
		if (zip64) ({compSize, size, localOffset, disk} = zip64Fields({compSize, size, localOffset, disk}, central64, name));
		if (disk) zipError(limits, 'archive_multidisk_unsupported', `readZip: "${name}" belongs to a split archive`);
		if (flags & ~0x080E) zipError(limits, 'archive_zip_features_unsupported', `readZip: "${name}" uses unsupported or encrypted flags`);
		if (method !== 0 && method !== 8) zipError(limits, 'archive_zip_features_unsupported', `readZip: "${name}" uses compression method ${method}, which this reader does not support (only stored and deflate)`);
		if (limits.fileTypes) {
			const attributes = cv.getUint32(38, true), kind = attributes >>> 16 & 0xf000;
			if (kind && kind !== 0x8000 && kind !== 0x4000) zipError(limits, 'archive_nonregular_file', `readZip: "${name}" is not a regular file`);
			if ((kind === 0x4000 || attributes & 0x10) && !directory || directory && (size || kind === 0x8000)) zipError(limits, 'archive_directory_invalid', `readZip: "${name}" is not a valid directory`);
		}
		if (limits.capCompressed && compSize > byteLimit || size > budget) {
			if (limits.errors === 'archive') throw new Error('archive_byte_limit');
			throw zipAdmissionError('bytes', `"${name}" is listed as ${attachmentSizeWords(size)}; the archive size limit is ${attachmentSizeWords(byteLimit)}. Export fewer files at a time.`);
		}
		if (limits.errors === 'archive' && method === 0 && compSize !== size) throw new Error('archive_stored_size_invalid');
		budget -= size;
		if (localOffset + 30 > cdOffset) zipError(limits, 'archive_zip_local_invalid', `readZip: "${name}" has no valid local header`);
		const local = yield [localOffset, 30], lv = new DataView(local.buffer, local.byteOffset, local.byteLength);
		if (lv.getUint32(0, true) !== 0x04034b50) zipError(limits, 'archive_zip_local_invalid', `readZip: "${name}" has no valid local header`);
		const localNameLen = lv.getUint16(26, true), localExtraLen = lv.getUint16(28, true);
		const dataStart = localOffset + 30 + localNameLen + localExtraLen, dataEnd = dataStart + compSize;
		if (dataEnd > cdOffset || limits.errors === 'archive' && localNameLen !== nameLen) zipError(limits, 'archive_zip_local_invalid', `readZip: "${name}" is truncated before the central directory`);
		const localExtra = yield [localOffset + 30, localNameLen + localExtraLen];
		const headerDisagrees = flags !== lv.getUint16(6, true) || method !== lv.getUint16(8, true) || limits.matchTime && (cv.getUint16(6, true) !== lv.getUint16(4, true) || cv.getUint32(12, true) !== lv.getUint32(10, true)) || !equalBytes(nameBytes, localExtra.subarray(0, localNameLen));
		if (limits.versionMax < Infinity && lv.getUint16(4, true) > limits.versionMax || headerDisagrees) zipError(limits, 'archive_zip_local_mismatch', `readZip: "${name}" has a local header that disagrees with its central directory`);
		const local64 = checkExtra(localExtra, localNameLen, localExtraLen, name, limits);
		if (!zip64 && local64) zipError(limits, 'archive_zip64_unsupported', `readZip: "${name}" uses ZIP64`);
		if ((central64 || local64) && cv.getUint16(6, true) < 45) throw new Error(`readZip: "${name}" uses ZIP64 without version 4.5 headers`);
		const localSizes = zip64 ? zip64Fields({compSize: lv.getUint32(18, true), size: lv.getUint32(22, true)}, local64, name, true) : {compSize: lv.getUint32(18, true), size: lv.getUint32(22, true)};
		if (!zip64 && (localSizes.compSize === 0xFFFFFFFF || localSizes.size === 0xFFFFFFFF)) zipError(limits, 'archive_zip64_unsupported', `readZip: "${name}" uses ZIP64`);
		const localFields = [lv.getUint32(14, true), localSizes.compSize, localSizes.size], expected = [crc, compSize, size];
		if (localFields.some((value, j) => value !== expected[j] && (!(flags & 8) || value !== 0))) zipError(limits, 'archive_zip_local_mismatch', `readZip: "${name}" has CRC or sizes that disagree between headers`);
		let localEnd = dataEnd;
		if (flags & 8) {
			const wide = !!(central64 || local64), width = wide ? 20 : 12;
			const descriptor = yield [dataEnd, Math.min(width + 4, cdOffset - dataEnd)], dv = new DataView(descriptor.buffer, descriptor.byteOffset, descriptor.byteLength);
			const sizeMatches = (start, value) => dv.getUint32(start, true) === value % 0x100000000 && dv.getUint32(start + 4, true) === Math.floor(value / 0x100000000);
			const matches = start => start + width <= descriptor.length && dv.getUint32(start, true) === crc && (wide
				? sizeMatches(start + 4, compSize) && sizeMatches(start + 12, size)
				: dv.getUint32(start + 4, true) === compSize && dv.getUint32(start + 8, true) === size);
			if (descriptor.length >= 4 && dv.getUint32(0, true) === 0x08074b50 && matches(4)) localEnd += width + 4;
			else if (matches(0)) localEnd += width;
			else zipError(limits, 'archive_zip_descriptor_invalid', `readZip: "${name}" has a missing or inconsistent data descriptor`);
		}
		records.push({name, directory, crc, method, size, compSize, localOffset, localEnd, dataStart});
		metadata += nameLen + 64;
		if (metadata > maxMetadataBytes) {
			if (limits.errors === 'archive') throw new Error('archive_byte_limit');
			throw zipAdmissionError('metadata', `"${name}" puts the archive's file list over ${attachmentSizeWords(maxMetadataBytes)}. Export fewer files at a time.`);
		}
		at = next;
	}
	if (at !== eocd) zipError(limits, 'archive_zip_directory_invalid', 'readZip: the file count or central directory size does not match its entries');
	const ordered = records.slice().sort((a, b) => a.localOffset - b.localOffset);
	if (limits.contiguous) {
		let covered = 0;
		for (const record of ordered) {
			if (record.localOffset !== covered) zipError(limits, 'archive_zip_overlap_or_gap', `readZip: "${record.name}" overlaps another entry`);
			covered = record.localEnd;
		}
		if (covered !== cdOffset) zipError(limits, 'archive_zip_local_invalid', 'readZip: the local headers do not fill the archive');
	} else for (let i = 1; i < ordered.length; i++) if (ordered[i].localOffset < ordered[i - 1].localEnd) throw new Error(`readZip: "${ordered[i].name}" overlaps another entry`);
	return records;
}
export function zipRanges(length, options) { return scanZip(length, options); }

export async function readZip(bytes, options = {}) {
	const {maxBytes = ZIP_READ_MAX_BYTES, maxEntries = ZIP_MAX_ENTRIES} = options;
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || !Number.isSafeInteger(maxEntries) || maxEntries < 0) throw new Error('readZip: admission bounds must be nonnegative safe integers');
	const entries = [];
	for await (const entry of entriesOf(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {...options, maxBytes, maxEntries}, Infinity)) entries.push({name: entry.name, bytes: await entry.read()});
	return entries;
}


export const ZIP_ENTRY_MEMORY_BYTES = 16 * 1024 * 1024;
export const ZIP_IO_BYTES = 64 * 1024;
const zipAbort = signal => { if (signal?.aborted) throw signal.reason || new Error('readZip: canceled'); };

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
async function decodeRecord(source, record, {signal, errors = 'notes', retain = true} = {}) {
	const {name, size, method, crc} = record;
	const fail = (archiveCode, notesError) => { throw errors === 'archive' ? new Error(archiveCode) : notesError; };
	zipAbort(signal);
	const out = retain ? new Uint8Array(size) : null; let length = 0, sum = 0;
	const accept = part => {
		zipAbort(signal);
		if (length + part.length > size) fail('archive_expansion_limit', new Error(`readZip: "${name}" inflated past its declared size; refused as a probable zip bomb`));
		if (out) out.set(part, length);
		sum = crc32(part, sum); length += part.length;
	};
	if (method === 0) {
		if (record.compSize !== size) fail('archive_stored_size_invalid', zipSizeMismatch(name, record.compSize, size));
		for await (const part of compressedChunks(source, record, signal)) accept(part);
	} else {
		let stream;
		try { stream = new DecompressionStream('deflate-raw'); }
		catch (error) { if (errors === 'archive') throw new Error('archive_deflate_unavailable'); throw error; }
		const writer = stream.writable.getWriter(), reader = stream.readable.getReader();
		const feed = (async () => {
			try { for await (const part of compressedChunks(source, record, signal)) await writer.write(part); await writer.close(); }
			catch (error) { await writer.abort(error).catch(() => {}); throw error; }
		})();
		feed.catch(() => {});
		try {
			for (;;) {
				let step;
				try { step = await reader.read(); } catch (error) {
					if (errors === 'archive' || error?.name === 'AbortError' || error?.message === 'archive_closed') throw error;
					throw new Error(`readZip: "${name}" could not be inflated (${error?.message || error})`);
				}
				if (step.done) break;
				accept(step.value);
			}
			await feed;
		} finally {
			await Promise.allSettled([reader.cancel(), writer.abort()]); await feed.catch(() => {});
			reader.releaseLock(); writer.releaseLock();
		}
	}
	if (length !== size) fail('archive_uncompressed_size_invalid', zipSizeMismatch(name, length, size));
	if (sum !== crc) fail('archive_checksum_failed', new Error(`readZip: "${name}" failed CRC-32 verification`));
	return out;
}
export function zipMember(source, record, options) { return decodeRecord(source, record, options); }

export async function* zipEntries(value, options = {}) {
	const {maxEntryBytes = ZIP_ENTRY_MEMORY_BYTES, maxMetadataBytes = ZIP_METADATA_BYTES} = options;
	if (![maxEntryBytes, maxMetadataBytes].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('readZip: memory bounds must be nonnegative safe integers');
	yield* entriesOf(value, options, Math.min(maxEntryBytes, ZIP_ENTRY_MEMORY_BYTES));
}
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
