// SPDX-License-Identifier: AGPL-3.0-only
import {emptyIndex, serializeIndex, isCodeFile} from './model.mjs';
import {exactBytes, sha256} from './integrity.mjs';
import {manifestName, parseManifest, materialize, canonicalSources, readCanonical} from './history.mjs';
import {attachmentsOf} from './attachments.mjs';
import {recordingsOf} from './audio.mjs';

export async function prepareLockedNote({store, index, file, id, digest}) {
	for (const leaf of await store.list('imports')) {
		const bytes = await store.read('imports/' + leaf);
		if (bytes == null) continue;
		let record;
		try { record = JSON.stringify(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes))); }
		catch { throw new Error('An import record could not be checked. Nothing was locked.'); }
		if (record.includes(JSON.stringify(id)) || record.includes(JSON.stringify(file)))
			throw new Error('This note still belongs to a retained import record. Its import history must stay intact, so it cannot be locked.');
	}
	const source = await store.read(file), entry = index.notes[file];
	if (!entry || entry.id !== id || source == null || await sha256(source) !== digest)
		throw new Error('This note changed. Open it again before locking it.');
	const files = new Map([[file, exactBytes(source)]]), media = new Set();
	const text = bytes => new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
	const references = words => {
		if (isCodeFile(file)) return;
		for (const row of attachmentsOf(words)) media.add('attachments/' + row.name);
		for (const row of recordingsOf(words)) media.add('audio/' + row.name);
	};
	references(text(source));
	const path = 'history/' + manifestName(id), raw = await store.read(path);
	if (raw != null) {
		const history = parseManifest(raw, {noteId: id, now: Date.now()});
		if (entry.canonicalHistory && readCanonical(history, text(source)).ledger.sha256 !== entry.canonicalHistory)
			throw new Error('The note’s history could not be verified.');
		files.set(path, exactBytes(raw));
		for (const [hash, object] of Object.entries(history.objects)) {
			for (const name of ['texts/' + hash, ...(object.blobs || []).map(blob => 'blobs/' + blob.hash)]) {
				const bytes = await store.read('history/' + name);
				if (bytes == null) throw new Error('The note’s history is incomplete.');
				files.set('history/' + name, exactBytes(bytes));
			}
		}
		for (const version of history.versions) references((await materialize(history, version.id, name => store.read('history/' + name))).text);
		for (const version of canonicalSources(history)) references(version.text);
	} else if (entry.canonicalHistory) throw new Error('The note’s history is missing.');
	for (const name of media) {
		const bytes = await store.read(name);
		if (bytes == null) throw new Error('A file in this note is missing.');
		files.set(name, exactBytes(bytes));
	}
	const privateIndex = {...emptyIndex(), folderDeviceId: index.folderDeviceId, noteCounters: index.noteCounters,
		notes: {[file]: structuredClone(entry)}, sections: (index.sections || []).filter(section => section.name === entry.category)};
	files.set('notes.json', exactBytes(serializeIndex(privateIndex)));
	return {file, id, files, media, ledger: entry.canonicalHistory};
}

export function createPrivateDrafts({initial, token, native}) {
	const prefix = '.rapier-private-draft-', values = new Map(Object.entries(initial).map(([key, value]) => [key.slice(prefix.length), value]));
	const check = message => { if (message) throw new Error(message); };
	return {
		get length() { return values.size; }, key: at => [...values.keys()][at] ?? null,
		getItem: key => values.get(key) ?? null,
		setItem(key, value) { value = String(value); check(native.write(token, prefix + key, value)); values.set(key, value); },
		removeItem(key) { check(native.remove(token, prefix + key)); values.delete(key); },
		checkpoint: () => Object.fromEntries([...values].map(([key, value]) => [prefix + key, value])),
	};
}
