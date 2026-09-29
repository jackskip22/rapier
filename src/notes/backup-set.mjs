// SPDX-License-Identifier: AGPL-3.0-only
import {writeBackupStream} from './backup-stream.mjs';
import {BACKUP_CHUNK_BYTES, check} from './backup-folder.mjs';
import {sha256State, sha256, exactBytes} from './integrity.mjs';
import {backupManifestHeader} from './restore.mjs';

// Every part describes the digests in every other part. Hash the held sources first, then
// stream them again and compare: no future digest is guessed, and no library-sized byte list
// is retained. The one-archive button keeps its existing single-pass writer and worker.
export async function writeBackupSet(source, createSink, {plan, name, assertCurrent, signal, onProgress, onPrepared, onPart, startPart = 1, preparedManifest, ...options} = {}) {
	if (typeof source !== 'function' || typeof createSink !== 'function' || !plan?.parts?.length || typeof assertCurrent !== 'function') throw new TypeError('a backup set needs its plan, sources, sinks and snapshot check');
	if (!Number.isInteger(startPart) || startPart < 1 || startPart > plan.parts.length) throw new TypeError('a backup continuation needs an existing part number');
	if (typeof name !== 'string' || !/^[^/\\\0]+\.zip$/i.test(name)) throw new TypeError('a backup needs a ZIP name');
	const manifest = JSON.parse(JSON.stringify(plan.manifest)), names = manifest.files.map(row => row.name), pending = new Map(manifest.files.map(row => [row.name, row])), hashes = new Map();
	let indexBytes = null, readBytes = 0;
	for await (const file of source(names)) {
		check(signal);
		const expected = pending.get(file.name);
		if (!expected || file.size !== expected.bytes) throw new Error('the backup source changed size or name: ' + file.name);
		const hash = sha256State(), index = file.name === 'notes.json' ? new Uint8Array(file.size) : null;
		let size = 0;
		const chunks = typeof file.chunks === 'function' ? file.chunks() : [exactBytes(await file.read())];
		for await (const bytes of chunks) {
			check(signal);
			if (!(bytes instanceof Uint8Array) || typeof file.chunks === 'function' && bytes.length > BACKUP_CHUNK_BYTES || size + bytes.length > file.size) throw new Error('the backup source changed or exceeded its chunk bound: ' + file.name);
			hash.update(bytes); index?.set(bytes, size); size += bytes.length; readBytes += bytes.length;
			onProgress?.({phase: 'Checking backup files', files: hashes.size, bytes: readBytes});
		}
		if (size !== expected.bytes) throw new Error('the backup source changed size: ' + file.name);
		hashes.set(file.name, hash.finish()); pending.delete(file.name); if (index) indexBytes = index;
	}
	if (pending.size) throw new Error('a backup source disappeared: ' + [...pending.keys()].join(', '));
	const header = backupManifestHeader([...manifest.files, ...(manifest.omitted || [])].map(row => ({name: row.name, ...(row.name === 'notes.json' ? {bytes: indexBytes} : {})})), options);
	for (const key of ['revision', 'folderGeneration']) if (JSON.stringify(header[key]) !== JSON.stringify(manifest[key])) throw new Error('the backup sidecar changed before writing');
	for (const row of manifest.files) row.sha256 = hashes.get(row.name);
	if (manifest.set) {
		for (const part of manifest.set.parts) for (const row of part.files) row.sha256 = hashes.get(row.name);
		manifest.set.id = await sha256(exactBytes(JSON.stringify({...manifest, set: {...manifest.set, id:'0'.repeat(64), part: 0}})));
	}
	if (preparedManifest && JSON.stringify(manifest) !== JSON.stringify(preparedManifest)) throw new Error('The notes changed since this earlier backup; discard this backup copy to start a new complete set');
	await onPrepared?.(manifest);
	const parts = [];
	for (const part of plan.parts.slice(startPart - 1)) {
		check(signal);
		const partName = plan.parts.length === 1 ? name : name.replace(/\.zip$/i, '') + ' part ' + part.number + ' of ' + plan.parts.length + '.zip';
		const partManifest = {...manifest, ...(manifest.set ? {set: {...manifest.set, part: part.number}} : {})};
		const sink = await createSink(partName, part.number);
		const result = await writeBackupStream(source(part.names), sink, {...options, maxBytes: plan.maxBytes, manifest: partManifest, signal, onProgress,
			assertCurrent});
		const completed = {...result, name: partName, number: part.number, sink};
		if (onPart) {
			// The consumer accepts and releases this part before another sink can be opened.
			const accepted = await onPart(completed);
			parts.push({name: partName, number: part.number, bytes: result.bytes, files: result.files, payloadBytes: result.payloadBytes});
			if (accepted === false) break;
		} else parts.push(completed);
	}
	return {parts, files: manifest.files.length, bytes: parts.reduce((n, part) => n + part.bytes, 0),
		payloadBytes: parts.reduce((n, part) => n + part.payloadBytes, 0), omitted: plan.omitted, setId: manifest.set?.id || null};
}
