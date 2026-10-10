// SPDX-License-Identifier: AGPL-3.0-only
import {crc32, ZIP_READ_MAX_BYTES, ZIP_WRITE_METADATA_BYTES} from './zip.mjs';
import {dosDateTime, localHeader, centralHeader, dataDescriptor, endRecord, commentBytes} from './zip-records.mjs';
import {exactBytes, sha256, sha256State} from './integrity.mjs';
import {BACKUP_CHUNK_BYTES, backupLimitError, check as checkAbort} from './backup-folder.mjs';
import {BACKUP_MANIFEST_FILE, BACKUP_INDEX_MAX_BYTES, backupManifestHeader} from './restore.mjs';
import {attachmentSizeWords} from './size-words.mjs';

const MAX_INDEX_BYTES = BACKUP_INDEX_MAX_BYTES, MAX_METADATA_BYTES = ZIP_WRITE_METADATA_BYTES;

// The settled index already belongs to the button's snapshot guard. Only its manifest header
// is needed here; payload lengths come from the acquired File/native stat, not re-encoded text.
// SHA-256 always occupies 64 ASCII characters. With those placeholders, this is the exact
// stored-stream size (including descriptors, generated manifest, directory and comment).
export function preflightBackup(inventory, {indexText, appVersion, stamp, comment = '', maxBytes = ZIP_READ_MAX_BYTES, manifestHeader, maxIndexBytes = MAX_INDEX_BYTES} = {}) {
	const enc = new TextEncoder(), names = inventory.map(row => row.name), seen = new Set();
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 22 || maxBytes > ZIP_READ_MAX_BYTES) throw new Error('backup byte bound is outside the reader limit');
	if (!Number.isSafeInteger(maxIndexBytes) || maxIndexBytes < 0) throw new Error('backup index byte bound is invalid');
	if (inventory.length > 65533) throw backupLimitError(names, 'have too many files for the backup manifest');
	let metadata = 0;
	for (const row of inventory) {
		fileName(row.name, seen);
		if (!Number.isSafeInteger(row.size) || row.size < 0) throw new Error('a backup file has no valid size: ' + row.name);
		const length = enc.encode(row.name).length;
		if (length > 65535) throw backupLimitError(names, 'have a file name too long for ZIP: ' + row.name);
		metadata += 2 * length + 256;
		if (row.name === 'notes.json' && row.size > maxIndexBytes) throw backupLimitError(names, 'have more than ' + attachmentSizeWords(maxIndexBytes) + ' of library details, too much for one backup');
	}
	if (metadata > MAX_METADATA_BYTES) throw backupLimitError(names, 'have too many file details for this backup');
	// A native recovery export may hold an unreadable original index. Its explicit recovery
	// envelope still uses this ZIP budget owner without fabricating replacement folder metadata.
	const header = manifestHeader || backupManifestHeader(inventory.map(row => ({name: row.name, ...(row.name === 'notes.json' ? {bytes: enc.encode(indexText)} : {})})), {appVersion, stamp});
	const sidecar = inventory.find(row => row.name === 'notes.json'), omitted = [];
	const order = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
	const declaration = row => ({name: row.name, bytes: row.size, sha256: '0'.repeat(64)});
	const weight = row => row ? row.size + 92 + 2 * enc.encode(row.name).length : 0;
	const fixed = 22 + commentBytes(comment, enc).length + 76 + 2 * enc.encode(BACKUP_MANIFEST_FILE).length;
	let kept = inventory.slice(), groups = [kept];
	const manifestOf = (number = groups.length) => ({...header, files: kept.map(declaration).sort(order),
		...(omitted.length ? {omitted: omitted.map(row => ({...row}))} : {}),
		...(groups.length > 1 ? {set: {id: '0'.repeat(64), count: groups.length, part: number,
			parts: groups.map((rows, i) => ({number: i + 1, files: rows.map(declaration).sort(order)}))}} : {})});
	const encodedSize = manifest => {
		const size = enc.encode(JSON.stringify(manifest, null, 1) + '\n').length;
		if (size > MAX_METADATA_BYTES) throw backupLimitError(names, 'have too many file details for this backup');
		return size;
	};
	let reserve = encodedSize(manifestOf());
	// Whole members, with the complete table reserved in EACH archive. The reserve only grows:
	// adding part numbers or repeated sidecar declarations cannot push a finished part over its bound.
	while (groups.some(rows => fixed + reserve + rows.reduce((n, row) => n + weight(row), 0) > maxBytes)) {
		const room = maxBytes - fixed - reserve - weight(sidecar);
		if (room < 0) throw backupLimitError(names, 'have library details that cannot fit in one readable archive');
		const next = [], retained = sidecar ? [sidecar] : []; let rows = retained.slice(), used = 0;
		for (const row of kept) {
			if (row === sidecar) continue;
			const cost = weight(row);
			if (cost > room) {
				omitted.push({name: row.name, bytes: row.size, reason: 'This file cannot fit whole with its backup details under the ' + maxBytes.toLocaleString('en') + '-byte archive bound.'});
				continue;
			}
			if (used + cost > room) { next.push(rows); rows = sidecar ? [sidecar] : []; used = 0; }
			rows.push(row); used += cost; retained.push(row);
		}
		next.push(rows); groups = next; kept = retained;
		reserve = Math.max(reserve, encodedSize(manifestOf()));
	}
	// Omissions may leave a small remainder. That is one ordinary archive with an omission list,
	// never an invented single-part set. A fitting, complete library retains today's manifest shape.
	const split = groups;
	groups = [kept];
	if (fixed + encodedSize(manifestOf()) + kept.reduce((n, row) => n + weight(row), 0) > maxBytes) groups = split;
	const manifest = manifestOf(1), parts = groups.map((rows, i) => {
		const manifestBytes = encodedSize(manifestOf(i + 1));
		return {number: i + 1, names: rows.map(row => row.name), files: rows.length + 1,
			bytes: fixed + manifestBytes + rows.reduce((n, row) => n + weight(row), 0),
			payloadBytes: manifestBytes + rows.reduce((n, row) => n + row.size, 0)};
	});
	return {files: kept.length + 1, bytes: parts.reduce((n, part) => n + part.bytes, 0), payloadBytes: parts.reduce((n, part) => n + part.payloadBytes, 0), maxBytes, parts, omitted, manifest};
}

function fileName(name, seen) {
	if (typeof name !== 'string' || !name || /[\\\0]/.test(name) || name.startsWith('/') || /^[a-z]:/i.test(name)
		|| name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('backup path is not relative: ' + name);
	if (new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(new TextEncoder().encode(name)) !== name) throw new Error('backup path is not exact UTF-8');
	if (name === BACKUP_MANIFEST_FILE) throw new Error('the backup manifest is generated, not a folder file');
	if (seen.has(name)) throw new Error('duplicate backup file: ' + name);
	seen.add(name);
}

// The sink is private staging until close succeeds; dispatch is a separate, unclaimed outcome.
export async function writeBackupStream(source, sink, {appVersion, stamp, assertCurrent, signal, subtle, onProgress, maxBytes = ZIP_READ_MAX_BYTES, maxIndexBytes = MAX_INDEX_BYTES, maxMetadataBytes = MAX_METADATA_BYTES, comment = '', manifest: suppliedManifest} = {}) {
	if (!sink || typeof sink.write !== 'function' || typeof sink.close !== 'function' || typeof sink.abort !== 'function') throw new TypeError('backup needs a staging sink with write, close and abort');
	let offset = 0, rawBytes = 0, centralBytes = 0, inputFiles = 0, metadataBytes = 0;
	const seen = new Set(), central = [], records = [], digests = [], enc = new TextEncoder();
	const commentData = commentBytes(comment, enc);
	const put = async bytes => {
		checkAbort(signal);
		if (offset + bytes.length > maxBytes) throw new Error('backup archive exceeds its byte bound');
		await sink.write(bytes); offset += bytes.length; checkAbort(signal);
	};
	const entry = async (name, data, modified) => {
		const nameBytes = enc.encode(name);
		if (nameBytes.length > 65535) throw new Error('backup file name is too long');
		if (!Number.isFinite(modified)) throw new Error('backup modified time is not finite');
		const date = new Date(modified);
		if (!Number.isFinite(date.getTime())) throw new Error('backup modified time is out of range');
		const f = {nameBytes, size: data.length, crc: crc32(data), ...dosDateTime(modified)};
		const finalSize = offset + 30 + nameBytes.length + data.length + centralBytes + 46 + nameBytes.length + 22 + commentData.length;
		if (finalSize > maxBytes || rawBytes + data.length > maxBytes) throw new Error('backup archive exceeds its byte bound');
		const at = offset;
		await put(localHeader(f)); await put(nameBytes); await put(data);
		await sink.endMember?.(data.length);
		central.push(centralHeader(f, at), nameBytes); centralBytes += 46 + nameBytes.length; rawBytes += data.length;
	};
	// Hash, CRC and archive receive the same acquired bytes. The descriptor puts the CRC after
	// the data, avoiding a second file read without holding more than the sidecar and one chunk.
	const streamed = async file => {
		const {name, size, modified = stamp} = file, nameBytes = enc.encode(name);
		if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) throw new Error('backup file size exceeds its byte bound: ' + name);
		if (name === 'notes.json' && size > maxIndexBytes) throw new Error('backup notes.json exceeds its index byte bound');
		if (nameBytes.length > 65535) throw new Error('backup file name is too long');
		if (!Number.isFinite(modified) || !Number.isFinite(new Date(modified).getTime())) throw new Error('backup modified time is not finite or is out of range');
		if (offset + 30 + nameBytes.length + size + 16 + centralBytes + 46 + nameBytes.length + 22 + commentData.length > maxBytes) throw new Error('backup archive exceeds its byte bound');
		const index = name === 'notes.json' ? new Uint8Array(size) : null;
		const f = {nameBytes, size, crc: 0, descriptor: true, ...dosDateTime(modified)}, at = offset;
		await put(localHeader(f)); await put(nameBytes);
		const hash = sha256State(); let length = 0;
		for await (const chunk of file.chunks()) {
			checkAbort(signal);
			if (!(chunk instanceof Uint8Array) || chunk.length > BACKUP_CHUNK_BYTES) throw new Error('backup source exceeded its 65536-byte chunk bound: ' + name);
			if (length + chunk.length > size) throw new Error('backup source changed size: ' + name);
			hash.update(chunk); if (index) index.set(chunk, length);
			f.crc = crc32(chunk, f.crc); length += chunk.length;
			await put(chunk);
			onProgress?.({phase: 'Preparing backup', files: inputFiles - 1, bytes: rawBytes + length});
		}
		if (length !== size) throw new Error('backup source changed size: ' + name);
		await put(dataDescriptor(f));
		await sink.endMember?.(size);
		central.push(centralHeader(f, at), nameBytes); centralBytes += 46 + nameBytes.length; rawBytes += size;
		return {digest: hash.finish(), index};
	};
	try {
		if (!Number.isSafeInteger(maxBytes) || maxBytes < 22 || maxBytes > ZIP_READ_MAX_BYTES) throw new Error('backup byte bound is outside the reader limit');
		if (![maxIndexBytes, maxMetadataBytes].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('backup metadata bounds must be nonnegative safe integers');
		if (typeof appVersion !== 'string' || !appVersion || !Number.isFinite(stamp)) throw new Error('a backup manifest needs the app version and snapshot stamp');
		if (typeof assertCurrent !== 'function') throw new TypeError('backup needs a snapshot certification callback');
		if (!source || typeof source[Symbol.asyncIterator] !== 'function' && typeof source[Symbol.iterator] !== 'function') throw new TypeError('backup source must be iterable');
		checkAbort(signal);
		onProgress?.({phase: 'Preparing backup', files: 0, bytes: 0});
		for await (const file of source) {
			checkAbort(signal);
			if (++inputFiles > 65533) throw new Error('a backup needs room for its manifest below the ZIP64 sentinel count');
			fileName(file?.name, seen);
			metadataBytes += enc.encode(file.name).length * 2 + 256;
			if (metadataBytes > maxMetadataBytes) throw new Error('backup metadata exceeds its byte bound');
			if (typeof file.chunks === 'function') {
				const result = await streamed(file);
				records.push(result.index ? {name: file.name, bytes: result.index} : {name: file.name});
				digests.push({name: file.name, bytes: file.size, sha256: result.digest});
			} else {
				if (typeof file.read !== 'function') throw new TypeError('a backup source file needs a lazy read function');
				const data = exactBytes(await file.read()); checkAbort(signal);
				if (file.name === 'notes.json' && data.length > maxIndexBytes) throw new Error('backup notes.json exceeds its index byte bound');
				const digest = await sha256(data, {subtle}); checkAbort(signal);
				await entry(file.name, data, file.modified ?? stamp);
				records.push(file.name === 'notes.json' ? {name: file.name, bytes: data} : {name: file.name});
				digests.push({name: file.name, bytes: data.length, sha256: digest});
			}
			onProgress?.({phase: 'Preparing backup', files: inputFiles, bytes: rawBytes});
		}
		const ordered = digests.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
		const manifest = suppliedManifest || {...backupManifestHeader(records, {appVersion, stamp}), files: ordered};
		if (suppliedManifest) {
			const expected = manifest.set ? manifest.set.parts[manifest.set.part - 1].files : manifest.files;
			if (JSON.stringify(expected) !== JSON.stringify(ordered)) throw new Error('the backup source changed between hashing and writing a part');
		}
		const manifestBytes = enc.encode(JSON.stringify(manifest, null, 1) + '\n');
		if (manifestBytes.length > maxMetadataBytes) throw new Error('backup manifest exceeds its metadata byte bound');
		await entry(BACKUP_MANIFEST_FILE, manifestBytes, stamp);
		const start = offset;
		for (const bytes of central) await put(bytes);
		await put(endRecord(inputFiles + 1, offset - start, start, commentData.length));
		await put(commentData);
		onProgress?.({phase: 'Checking folder'});
		if (await assertCurrent() !== true) throw new Error('the folder snapshot changed before backup completion');
		checkAbort(signal); const file = await sink.close({onProgress});
		return {status: 'staged', files: inputFiles + 1, bytes: offset, payloadBytes: rawBytes, manifest, file};
	} catch (error) {
		try { await sink.abort(error); }
		catch (abortError) { throw new AggregateError([error, abortError], 'backup failed and its staging cleanup also failed'); }
		throw error;
	}
}
