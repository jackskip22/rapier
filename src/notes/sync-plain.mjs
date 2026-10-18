// SPDX-License-Identifier: AGPL-3.0-only
import {isNoteFile} from './model.mjs';
import {mergeText} from '../kit/ledger/text-merge.mjs';
import {writePlainNote} from './sync-plain-conflicts.mjs';
import {markTrashed, reviveTrashed} from './trash.mjs';

const te = new TextEncoder();
const td = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const fail = (code, message) => Object.assign(new Error(message), {code});
const DEVICE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const PLAIN_CHOICES = Object.freeze([
	Object.freeze({id: 'encrypted', label: 'encrypted', detail: 'private: notes are locked with your vault before they leave this device. only rapier can open them.'}),
	Object.freeze({id: 'plain', label: 'plain files', detail: 'not private: one markdown file per note in this folder. any app or person with access to the folder can read and change them.'}),
]);
export const isSyncLayout = value => value === 'encrypted' || value === 'plain';

export async function syncPlainFiles({folder, store, base, device, other, guard = () => {}}) {
	if (!folder || !store || !base || typeof base.read !== 'function' || typeof base.write !== 'function') throw fail('config', 'plain-file sync needs a folder, a store and its agreed base.');
	if (!DEVICE.test(device || '') || !DEVICE.test(other || '') || device === other) throw fail('config', 'plain-file sync needs two distinct device names for its conflict blocks.');
	await guard();
	const agreed = new Map(Object.entries(await base.read() || {}));
	const result = {pushed: 0, pulled: 0, created: 0, renamed: 0, trashed: 0, removed: 0, conflicts: 0, held: []};
	const remote = new Map((await store.list()).filter(row => isNoteFile(row.name)).map(row => [row.name, row]));

	async function local() {
		await guard();
		const {index} = await folder.read(), notes = new Map();
		for (const [file, entry] of Object.entries(index.notes || {})) {
			const bytes = await folder.store.read(file);
			if (bytes) notes.set(entry.id, {file, entry, bytes, hash: await digest(bytes)});
		}
		return {index, notes};
	}
	let mine = await local();
	const fetched = new Map();
	const fetch = async name => {
		if (!fetched.has(name)) {
			const got = await store.get(name);
			fetched.set(name, got && {...got, hash: await digest(got.bytes)});
		}
		return fetched.get(name);
	};
	const text = bytes => { try { return td.decode(bytes); } catch { return null; } };
	const keep = (id, name, rev, hash, value) => agreed.set(id, {name, rev, hash, text: value});
	const hold = (name, why) => result.held.push({name, why});

	async function saveLocal(note, value, conflicts = null) {
		try {
			if (conflicts) await writePlainNote({folder, file: note.file, id: note.entry.id, digest: note.hash, text: value, conflicts, guard});
			else await folder.save({file: note.file, id: note.entry.id, expectedDigest: note.hash, text: value}, {admissionGuard: guard});
			return true;
		}
		catch (error) { await guard(); hold(note.file, error?.code || 'changed'); return false; }
	}
	async function setTrashed(note, trashed) {
		const lease = await folder.owner.acquire(folder.scope);
		const unchanged = async () => {
			await guard();
			const bytes = await folder.store.read(note.file);
			if (!bytes || await digest(bytes) !== note.hash) throw fail('changed', 'the note changed.');
			await guard();
		};
		try {
			await lease.transact(async ({index, bodies}) => {
				await guard();
				if (index.notes[note.file]?.id !== note.entry.id || !bodies.has(note.file) || await digest(bodies.get(note.file)) !== note.hash)
					throw fail('changed', 'the note changed.');
				return {kind: 'metadata', index: trashed ? markTrashed(index, note.file, {digest: note.hash, now: Date.now()})
					: reviveTrashed(index, note.file)};
			}, {bodies: [note.file], admissionGuard: unchanged});
			return true;
		} catch (error) { await guard(); hold(note.file, error?.code || 'changed'); return false; }
		finally { await lease.release(); }
	}
	async function push(name, value, condition) {
		await guard();
		try { return await store.put(name, te.encode(value), condition); }
		catch (error) { if (error?.code === 'conflict') { hold(name, 'conflict'); return null; } throw error; }
	}

	const claimed = new Set();
	for (const [id, was] of [...agreed]) {
		await guard();
		const note = mine.notes.get(id);
		if (note && text(note.bytes) === null) { hold(note.file, 'unreadable'); claimed.add(was.name); continue; }
		let theirs = remote.get(was.name);
		if (!theirs) for (const [name, row] of remote) {
			if (claimed.has(name) || [...agreed.values()].some(other => other.name === name) || row.size !== undefined && row.size !== te.encode(was.text).length) continue;
			const got = await fetch(name);
			if (got?.hash === was.hash) { theirs = row; break; }
		}
		if (theirs) claimed.add(theirs.name);
		const localGone = !note || note.entry.trashed === true;
		const localChanged = note && note.hash !== was.hash, remoteChanged = theirs && theirs.rev !== was.rev;
		if (!theirs && note && !localGone && note.file !== was.name) {
			const destination = await fetch(note.file);
			if (destination?.hash === note.hash) {
				keep(id, note.file, destination.rev, note.hash, text(note.bytes)); claimed.add(note.file); continue;
			}
		}
		if (!theirs) {
			if (localGone) { agreed.delete(id); continue; }
			if (!localChanged) { if (await setTrashed(note, true)) { result.trashed++; agreed.delete(id); } continue; }
			const put = await push(note.file, text(note.bytes) ?? '', {ifAbsent: true});
			if (put) { keep(id, note.file, put.rev, note.hash, text(note.bytes)); result.pushed++; }
			continue;
		}
		if (localGone) {
			if (!remoteChanged) {
				try { if (await store.remove(theirs.name, {ifRev: theirs.rev})) result.removed++; agreed.delete(id); }
				catch (error) { if (error?.code === 'conflict') hold(theirs.name, 'conflict'); else throw error; }
				continue;
			}
			if (note) {
				const got = await fetch(theirs.name), value = got && text(got.bytes);
				if (value === null || !got) { hold(theirs.name, 'unreadable'); continue; }
				if (!await setTrashed(note, false)) continue; mine = await local();
				const back = mine.notes.get(id);
				if (back && await saveLocal(back, value)) { keep(id, back.file, got.rev, got.hash, value); result.pulled++; }
			}
			continue;
		}
		let name = theirs.name;
		if (theirs.name !== was.name && note.file === was.name) {
			try {
				const renamed = await folder.rename({file: note.file, id, expectedDigest: note.hash, wanted: theirs.name}, {guard});
				result.renamed++; mine = await local();
				const now = mine.notes.get(id);
				if (now && now.file !== theirs.name) {
					const put = await push(now.file, text(now.bytes) ?? '', {ifAbsent: true});
					if (put && await store.remove(theirs.name, {ifRev: theirs.rev})) { name = now.file; theirs = {name, rev: put.rev}; }
				}
				void renamed;
			} catch (error) { hold(note.file, error?.code || 'rename'); continue; }
		} else if (note.file !== was.name && theirs.name === was.name) {
			const got = await fetch(theirs.name), remoteText = got && text(got.bytes), ours = text(note.bytes);
			if (!got || remoteText === null || ours === null) { hold(theirs.name, 'unreadable'); continue; }
			const merged = got.hash === was.hash || got.hash === note.hash ? {text: ours, conflicts: []}
				: note.hash === was.hash ? {text: remoteText, conflicts: []}
				: mergeText(was.text, ours, remoteText, {oursId: device, theirsId: other});
			if (merged.conflicts.length) result.conflicts++;
			if (merged.text !== ours && !await saveLocal(note, merged.text, merged.conflicts)) continue;
			const hash = await digest(te.encode(merged.text));
			const destination = await store.get(note.file);
			let put;
			if (destination) {
				const existing = await digest(destination.bytes);
				if (existing !== hash && existing !== note.hash) { hold(note.file, 'taken'); continue; }
				put = existing === hash ? {rev: destination.rev} : await push(note.file, merged.text, {ifRev: destination.rev});
			} else put = await push(note.file, merged.text, {ifAbsent: true});
			if (!put) continue;
			try { await guard(); await store.remove(theirs.name, {ifRev: got.rev}); }
			catch (error) { await guard(); if (error?.code !== 'conflict') throw error; hold(theirs.name, 'conflict'); continue; }
			keep(id, note.file, put.rev, hash, merged.text); result.renamed++; claimed.add(note.file);
			continue;
		}
		const current = mine.notes.get(id);
		if (!current) continue;
		const changedHere = current.hash !== was.hash;
		const changedThere = theirs.rev !== was.rev;
		if (!changedHere && !changedThere) { keep(id, current.file, theirs.rev, was.hash, was.text); continue; }
		const got = changedThere ? await fetch(theirs.name) : null;
		if (changedThere && !got) { hold(theirs.name, 'missing'); continue; }
		const ours = text(current.bytes), theirsText = got ? text(got.bytes) : null;
		if (ours === null || changedThere && theirsText === null) { hold(current.file, 'unreadable'); continue; }
		if (changedThere && got.hash === was.hash) {
			if (!changedHere) { keep(id, current.file, got.rev, was.hash, was.text); continue; }
		}
		if (!changedHere) {
			if (await saveLocal(current, theirsText)) { keep(id, current.file, got.rev, got.hash, theirsText); result.pulled++; }
			continue;
		}
		if (!changedThere || got.hash === current.hash) {
			if (got && got.hash === current.hash) { keep(id, current.file, got.rev, current.hash, ours); continue; }
			const put = await push(current.file, ours, {ifRev: theirs.rev});
			if (put) { keep(id, current.file, put.rev, current.hash, ours); result.pushed++; }
			continue;
		}
		const merged = mergeText(was.text, ours, theirsText, {oursId: device, theirsId: other});
		if (!merged.clean) result.conflicts++;
		if (!await saveLocal(current, merged.text, merged.conflicts)) continue;
		const put = await push(current.file, merged.text, {ifRev: got.rev});
		if (put) { keep(id, current.file, put.rev, await digest(te.encode(merged.text)), merged.text); result.pushed++; result.pulled++; }
	}

	mine = await local();
	const byName = new Map([...mine.notes.values()].map(note => [note.file, note]));
	for (const [name] of remote) {
		await guard();
		if (claimed.has(name) || [...agreed.values()].some(was => was.name === name)) continue;
		const got = await fetch(name), value = got && text(got.bytes);
		if (!got || value === null) { hold(name, 'unreadable'); continue; }
		const twin = byName.get(name);
		if (twin && text(twin.bytes) === null) { hold(name, 'unreadable'); continue; }
		if (twin && !agreed.has(twin.entry.id) && twin.entry.trashed !== true) {
			if (twin.hash === got.hash) { keep(twin.entry.id, name, got.rev, got.hash, value); continue; }
			const merged = mergeText(null, text(twin.bytes) ?? '', value, {oursId: device, theirsId: other});
			if (!merged.clean) result.conflicts++;
			if (!await saveLocal(twin, merged.text, merged.conflicts)) continue;
			const put = await push(name, merged.text, {ifRev: got.rev});
			if (put) keep(twin.entry.id, name, put.rev, await digest(te.encode(merged.text)), merged.text);
			continue;
		}
		if (twin) { hold(name, 'taken'); continue; }
		const made = await folder.create(value, name, {}, undefined, {guard});
		const madeName = typeof made === 'string' ? made : made?.file || name;
		mine = await local();
		const created = [...mine.notes.values()].find(note => note.file === madeName);
		if (!created) { hold(name, 'create'); continue; }
		result.created++;
		if (madeName !== name) {
			const put = await push(madeName, value, {ifAbsent: true});
			if (put && await store.remove(name, {ifRev: got.rev})) keep(created.entry.id, madeName, put.rev, got.hash, value);
		} else keep(created.entry.id, name, got.rev, got.hash, value);
	}

	mine = await local();
	for (const [id, note] of mine.notes) {
		await guard();
		if (agreed.has(id) || note.entry.trashed === true) continue;
		const value = text(note.bytes);
		if (value === null) { hold(note.file, 'unreadable'); continue; }
		const put = await push(note.file, value, {ifAbsent: true});
		if (put) { keep(id, note.file, put.rev, note.hash, value); result.pushed++; }
	}
	await guard();
	await base.write(Object.fromEntries(agreed));
	return result;
}

export function memoryPlainStore() {
	const files = new Map(); let counter = 0;
	const next = () => 'r' + (++counter);
	const conflict = () => fail('conflict', 'the file changed since it was read');
	const store = {
		async list() { return [...files].map(([name, row]) => ({name, rev: row.rev, size: row.bytes.length})); },
		async get(name) { const row = files.get(name); return row ? {bytes: row.bytes.slice(), rev: row.rev} : null; },
		async put(name, bytes, condition = {}) {
			const row = files.get(name);
			if (condition.ifAbsent ? !!row : row?.rev !== condition.ifRev) throw conflict();
			const rev = next(); files.set(name, {bytes: new Uint8Array(bytes), rev}); return {rev};
		},
		async remove(name, {ifRev} = {}) { const row = files.get(name); if (!row) return false; if (row.rev !== ifRev) throw conflict(); files.delete(name); return true; },
	};
	const app = {
		write(name, value) { files.set(name, {bytes: te.encode(value), rev: next()}); },
		read(name) { const row = files.get(name); return row ? td.decode(row.bytes) : null; },
		rename(from, to) { const row = files.get(from); files.delete(from); files.set(to, {bytes: row.bytes, rev: next()}); },
		delete(name) { files.delete(name); },
		names() { return [...files.keys()].sort(); },
	};
	let pictures = null;
	store.pictures = () => (pictures ??= memoryPlainStore()).store;
	app.pictures = () => (pictures ??= memoryPlainStore()).app;
	return {store, app, files};
}
