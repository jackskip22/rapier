// SPDX-License-Identifier: AGPL-3.0-only
import {exactBytes, sha256} from './integrity.mjs';
import {isMarkdownNote as isNoteFile} from './model.mjs';
import {recordingsOf, streamingRecordingType, inspectRecording, validRecordingName} from './audio.mjs';
import {recordingStem, recordingPaths, recordingStorageError} from './recording-files.mjs';
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', {fatal: true});
const fail = (code, text) => Object.assign(new Error(text), {code});
const same = (a, b) => a != null && b != null && a.length === b.length && a.every((n, i) => n === b[i]);
const hash = bytes => bytes == null ? null : sha256(bytes);
const durationOf = value => value == null ? null : typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : (() => { throw fail('recording-duration', 'The recording’s length is not known; nothing was lost.'); })();

export function createRecordings({store, owned, underLease, locks, scope, shared, clock, audioName, discardAudio, canOwn, readSnapshot, admissionGuard}) {
	let closed = false;
	const held = new Map();
	const ensure = () => { if (closed) throw fail('recording-closed', 'This folder is closed. The unfinished recording was kept.'); };
	const acquire = async id => {
		ensure(); if (held.has(id)) return null;
		if (!locks?.request) {
			if (shared()) throw fail('recording-lock', 'This page cannot safely own an unfinished recording. Keep this page open while recording.');
			const release = () => { held.delete(id); };
			held.set(id, release); return release;
		}
		return new Promise((resolve, reject) => {
			let release;
			Promise.resolve().then(() => locks.request('rapier-notes-recording:' + scope + ':' + id,
				{mode: 'exclusive', ifAvailable: true}, async lock => {
					if (!lock) { resolve(null); return; }
					await new Promise(done => {
						let active = true;
						release = () => { if (!active) return; active = false; held.delete(id); done(); };
						held.set(id, release);
						if (closed) { release(); reject(fail('recording-closed', 'This folder closed. The recording was kept.')); }
						else resolve(release);
					});
				})).catch(error => { release?.(); reject(error); });
		});
	};
	const requireRelease = async id => {
		const release = await acquire(id);
		if (!release) throw fail('recording-busy', 'This recording is still open in another page. Nothing was changed.');
		return release;
	};
	const writeMarker = async (id, marker) => {
		const path = id + '.json', bytes = enc.encode(JSON.stringify(marker));
		await store.write(path, bytes);
		if (!same(bytes, await store.read(path))) throw fail('recording-verify', 'The unfinished recording could not be checked; nothing was lost.');
	};
	const load = async id => {
		if (recordingStem(id + '.partial') !== id) throw fail('recording-name', 'This is not an unfinished recording.');
		const raw = await store.read(id + '.json');
		let marker = null;
		try {
			const m = raw && raw.length <= 16384 ? JSON.parse(dec.decode(raw)) : null;
			if (m?.version === 1 && recordingPaths(m.note, m.id).stem === id && isNoteFile(m.note)
				&& (m.noteId === null || typeof m.noteId === 'string' && !!m.noteId) && streamingRecordingType(m.mime)
				&& ['recording', 'publishing', 'finished'].includes(m.state)
				&& (m.stopped === undefined || typeof m.stopped === 'boolean')
				&& (m.restored === undefined || typeof m.restored === 'boolean')
				&& (m.state === 'recording' || validRecordingName(m.name) && /^[a-f0-9]{64}$/.test(m.digest)
					&& Number.isSafeInteger(m.size) && m.size > 0 && (m.duration === null || typeof m.duration === 'number' && Number.isFinite(m.duration) && m.duration >= 0))) marker = m;
		} catch (_) {  }
		let partial = null, final = null, error = null;
		try { partial = await store.read(id + '.partial');
			if (marker && marker.state !== 'recording') final = await store.read('audio/' + marker.name);
		} catch (why) { error = why; }
		let bytes = partial;
		if (bytes == null && marker && await hash(final) === marker.digest) bytes = final;
		return {id, raw, marker, partial, final, bytes, error, proof: {marker: await hash(raw), partial: await hash(partial), final: await hash(final)}};
	};
	const checkProof = (record, offer) => {
		if (record.error) throw record.error;
		if (!offer?.proof || JSON.stringify(record.proof) !== JSON.stringify(offer.proof))
			throw fail('recording-changed', 'This unfinished recording changed after it was offered. Open it again; nothing was discarded.');
	};
	const noteFor = (marker, index) => {
		if (!marker?.noteId) return null;
		const matches = Object.keys(index.notes).filter(file => index.notes[file].id === marker.noteId);
		return matches.length === 1 ? matches[0] : null;
	};
	const describe = (record, index) => {
		const {id, marker, bytes, proof} = record;
		const inspected = marker && bytes ? inspectRecording(bytes, marker.mime) : {duration: null, completeBytes: 0};
		return {id, note: noteFor(marker, index), originalNote: marker?.note ?? null, noteId: marker?.noteId ?? null,
			mime: marker?.mime ?? null, name: marker?.name ?? null, size: record.error ? null : bytes?.length ?? 0,
			completion: marker?.stopped === true ? 'recorder-stopped' : 'interrupted',
			duration: marker?.state === 'finished' ? marker.duration : inspected.duration, completeBytes: inspected.completeBytes, durationResolution: inspected.resolution ?? null,
			state: !marker ? 'unidentified' : marker.state, notice: marker?.state === 'finished' ? 'a saved recording waiting for its note link' : 'a recording that was cut short', proof,
			problem: record.error ? 'The unfinished recording could not be read. Its stored bytes were left untouched.' : !marker ? 'The recording record is unreadable. Its original bytes are still here.' : bytes == null ? 'The recording bytes are unavailable. Nothing was removed.' : null};
	};
	const recover = async ({snapshot} = {}) => {
		ensure();
		const ids = [...new Set((snapshot?.listing || await store.list()).map(recordingStem).filter(Boolean))].sort(), offers = [];
		for (const id of ids) {
			let release;
			try { release = await acquire(id); }
			catch (error) { offers.push({id, note: null, state: 'unavailable', readOnly: true, notice: 'a recording that was cut short', problem: error.message}); continue; }
			if (!release) continue;
			try {
				const inspect = async before => { const record = await load(id); if (record.raw != null || record.partial != null || record.error) offers.push({...describe(record, before.index), readOnly: !canOwn()}); };
				if (canOwn()) await owned(async (_lease, before) => inspect(before));
				else await inspect(snapshot || await readSnapshot());
			} catch (error) {
				offers.push({id, note: null, state: 'unavailable', readOnly: true, notice: 'a recording that was cut short', problem: error.message});
			} finally { release(); }
		}
		return offers;
	};
	const publishOwned = async (lease, before, r, {appendable = false, stopped = false, duration = null, restored = false, wanted = ''} = {}) => {
		const id = r.id;
		let marker = r.marker;
		const digest = await hash(r.bytes);
		if (marker.state !== 'recording' && digest !== marker.digest) throw fail('recording-changed', 'The saved recording bytes changed. Nothing was removed.');
		if (marker.state === 'recording' || restored) {
			marker = {...marker, state: 'publishing', name: audioName(noteFor(marker, before.index) || marker.note, marker.mime, wanted, await store.list('audio')),
				digest, size: r.bytes.length, stopped: marker.stopped === true || appendable && stopped === true, ...(restored ? {restored: true} : {}), duration: duration ?? marker.duration ?? inspectRecording(r.bytes, marker.mime).duration};
			await writeMarker(id, marker);
		}
		const path = 'audio/' + marker.name, existing = await store.read(path);
		if (existing != null && await hash(existing) !== digest) throw fail('recording-collision', 'Another file occupies this recording name. Both copies were kept.');
		if (existing == null) await lease.transact(({index}) => ({kind: 'recording', index, writes: [{file: path, bytes: r.bytes, createOnly: true}]}));
		if (!same(r.bytes, await store.read(path))) throw fail('recording-verify', 'The saved recording could not be verified. Its unfinished copy was kept.');
		await writeMarker(id, {...marker, state: 'finished'});
		await store.remove(id + '.partial');
		r = await load(id);
		return {...describe(r, before.index), name: marker.name, mime: marker.mime, duration: marker.duration};
	};
	const makeSession = (initial, release, {appendable = false} = {}) => {
		const id = initial.id; let active = true, queue = Promise.resolve(), appendError = null, offset = initial.bytes?.length ?? 0, accepting = appendable;
		const guard = () => { ensure(); if (!active) throw fail('recording-ended', 'This recording session has ended. Reopen its saved recording instead.'); };
		const enqueue = job => { const next = queue.then(job); queue = next.catch(() => {}); return next; };
		const end = () => { if (!active) return; active = false; accepting = false; release(); };
		const current = async () => { const r = await load(id); if (r.error) throw r.error; if (!r.marker) throw fail('recording-marker', 'The recording changed; nothing was lost.'); return r; };
		return {
			id,
			append(value) {
				try { guard(); if (!accepting) throw fail('recording-ended', 'A recovered or stopped recording cannot accept new microphone chunks.'); }
				catch (e) { return Promise.reject(e); }
				let captured; try { captured = value instanceof Blob ? value : exactBytes(value); } catch (e) { return Promise.reject(e); }
				return enqueue(async () => {
					guard(); if (appendError) throw appendError;
					try {
						const bytes = captured instanceof Blob ? new Uint8Array(await captured.arrayBuffer()) : captured;
						await underLease(async () => {
							if (await hash(await store.read(id + '.json')) !== initial.proof.marker) throw fail('recording-changed', 'The recording changed; nothing was lost.');
							offset = await store.recording.append(id + '.partial', offset, bytes);
						});
						return offset;
					} catch (e) { appendError = e; accepting = false; throw e; }
				});
			},
			read() { return enqueue(async () => { guard(); return underLease(async () => { const r = await load(id); if (r.error) throw r.error; return r.bytes; }); }); },
			finish(duration = null, {stopped = false} = {}) {
				try { guard(); duration = durationOf(duration); } catch (e) { return Promise.reject(e); }
				accepting = false;
				return enqueue(async () => {
					guard();
					try {
						if (appendError) throw appendError;
						return await owned(async (lease, before) => {
							let r = await current(), marker = r.marker;
							if (!appendable) checkProof(r, initial);
							else if (r.proof.marker !== initial.proof.marker) throw fail('recording-changed', 'The recording changed; nothing was lost.');
							if (!r.bytes?.length) throw fail('recording-empty', 'There are no saved recording bytes to keep. Nothing was removed.');
							return publishOwned(lease, before, r, {appendable, stopped, duration});
						});
					} finally { end(); }
				});
			},
			abandon() {
				accepting = false;
				return enqueue(async () => {
					guard();
					let admitted = false;
					const admitAbandon = () => { if (!admitted) { admissionGuard?.(); admitted = true; } };
					try {
						const r = await owned(async () => { const r = await load(id); if (r.error) throw r.error; if (!appendable) checkProof(r, initial); else if (r.proof.marker !== initial.proof.marker) throw fail('recording-changed', 'The recording record changed. Nothing was discarded.'); return r; });
						if (r.marker?.state !== 'recording' && r.marker?.name && r.final != null) {
							if (await hash(r.final) !== r.marker.digest) throw fail('recording-changed', 'This audio file changed. Nothing was discarded.');
							admitAbandon();
							await discardAudio(r.marker.name, {expectedDigest: r.marker.digest});
						}
						await owned(async () => {
							const now = await load(id);
							if (await hash(now.partial) !== await hash(r.partial) || await hash(now.raw) !== await hash(r.raw)) throw fail('recording-changed', 'This recording changed; what was recorded is kept.');
							admitAbandon();
							await store.remove(id + '.partial'); await store.remove(id + '.json');
						});
					} finally { end(); }
				});
			},
			release() { accepting = false; return enqueue(end); }
		};
	};
	const begin = async (note, mime) => {
		ensure();
		if (!isNoteFile(note)) throw fail('recording-note', 'Choose a note filename before recording.');
		if (!streamingRecordingType(mime)) throw Object.assign(fail('recording-container', 'This recording type cannot be recovered while recording. Keep this page open while recording.'), {fallback: 'whole-blob'});
		if (!store.recording || !await store.prepare() || store.durable === false) throw recordingStorageError();
		const identity = crypto.randomUUID().replace(/-/g, ''), {stem: id, partial} = recordingPaths(note, identity);
		const release = await requireRelease(id);
		try {
			const initial = await owned(async (_lease, before) => {
				if (await store.stat(partial) != null || await store.stat(id + '.json') != null) throw fail('recording-collision', 'This unfinished recording name is occupied.');
				const marker = {version: 1, id: identity, note, noteId: before.index.notes[note]?.id ?? null, mime: mime.toLowerCase(), created: clock(), state: 'recording'};
				admissionGuard?.();
				await writeMarker(id, marker); await store.recording.begin(partial);
				const result = await load(id);
				if (result.partial?.length !== 0) throw fail('recording-verify', 'The unfinished recording could not be started safely.');
				return result;
			});
			return makeSession(initial, release, {appendable: true});
		} catch (e) { release(); throw e; }
	};
	const open = async offer => {
		const id = offer?.id, release = await requireRelease(id);
		try {
			const initial = await owned(async () => { const r = await load(id); checkProof(r, offer); return r; });
			return makeSession(initial, release);
		} catch (e) { release(); throw e; }
	};
	const preview = async offer => {
		const release = await requireRelease(offer?.id);
		try {
			const read = async () => { const r = await load(offer.id); checkProof(r, offer); return r.bytes; };
			return canOwn() ? await underLease(read) : await read();
		} finally { release(); }
	};
	const acknowledge = async (offer, assignedNote = null) => {
		const release = await requireRelease(offer?.id);
		try { return await owned(async (_lease, before) => {
			const r = await load(offer.id); checkProof(r, offer);
			if (!r.marker || r.marker.state !== 'finished' || await hash(r.final) !== r.marker.digest) throw fail('recording-unpublished', 'The recording has not been safely saved. Its receipt was kept.');
			const note = r.marker.noteId ? noteFor(r.marker, before.index) : assignedNote;
			const noteBytes = note && before.index.notes[note] ? await store.read(note) : null;
			if (noteBytes == null || !recordingsOf(dec.decode(noteBytes)).some(row => row.name === r.marker.name))
				throw fail('recording-unlinked', 'Save the recording link in its note first. Its receipt was kept.');
			if (r.partial != null) { if (await hash(r.partial) !== r.marker.digest) throw fail('recording-changed', 'The unfinished copy changed; nothing was lost.'); await store.remove(offer.id + '.partial'); }
			await store.remove(offer.id + '.json');
			return {name: r.marker.name, note};
		}); } finally { release(); }
	};
	const restoreOriginal = async (lease, before, noteId, content, wanted) => {
		ensure();
		for (const id of [...new Set((await store.list()).map(recordingStem).filter(Boolean))].sort()) {
			const release = await acquire(id); if (!release) continue;
			try {
				const record = await load(id);
				if (record.error || record.marker?.noteId !== noteId || !record.bytes?.length || await hash(record.bytes) !== content) continue;
				if (record.marker.state !== 'recording' && record.marker.digest !== content) continue;
				return await publishOwned(lease, before, record, {restored: true, wanted});
			} finally { release(); }
		}
		return null;
	};
	const settleRestored = async (proved, snapshot) => {
		for (const id of [...new Set((snapshot.listing || await store.list()).map(recordingStem).filter(Boolean))]) {
			const release = await acquire(id); if (!release) continue;
			try {
				const record = await load(id), marker = record.marker;
				if (record.error || marker?.restored !== true || marker.state === 'recording' || marker.noteId !== proved.id ||
					!recordingsOf(proved.text).some(row => row.name === marker.name) || await hash(record.final) !== marker.digest) continue;
				if (record.partial != null) {
					if (await hash(record.partial) !== marker.digest) continue;
					await store.remove(id + '.partial');
				}
				await store.remove(id + '.json');
			} catch (_) {  }
			finally { release(); }
		}
	};
	return {begin, recover, open, preview, acknowledge, restoreOriginal, settleRestored, close() { closed = true; for (const release of [...held.values()]) release(); }};
}
