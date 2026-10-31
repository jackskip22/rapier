// SPDX-License-Identifier: AGPL-3.0-only
import {isAttachmentName} from './model.mjs';
import {attachmentsOf, rewriteAttachmentNames} from './attachments.mjs';
import {validRecordingName, recordingsOf, rewriteRecordingNames} from './audio.mjs';
import {lockedSyncBoundary} from './sync-state.mjs';
import {exactBytes} from './integrity.mjs';
import {manifestName, parseCanonical, serializeManifest, bindMedia} from './history.mjs';

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const MAX_BYTES = 150000000;
const AREAS = Object.freeze([
	{dir: 'attachments', valid: isAttachmentName, links: attachmentsOf, rewrite: rewriteAttachmentNames, create: (folder, name, bytes, guard) => folder.createAttachment(name, bytes, {exact: true, guard})},
	{dir: 'audio', valid: validRecordingName, links: recordingsOf, rewrite: rewriteRecordingNames, create: (folder, name, bytes, guard) => folder.createAudio('Recording.md', '', bytes, name, {exact: true, guard})},
]);

const stale = () => Object.assign(new Error('this file or note changed: read both versions again before choosing.'), {code: 'media_stale'});
const td = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
function mediaPath(path) {
	const [dir, name, extra] = typeof path === 'string' ? path.split('/') : [];
	const area = AREAS.find(row => row.dir === dir);
	if (!area || extra !== undefined || !area.valid(name)) throw stale();
	return {area, name};
}
async function identity(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BYTES) throw stale();
	return {hash: await digest(bytes), size: bytes.length};
}
const sameContent = (a, b) => a?.hash === b?.hash && a?.size === b?.size;
const mediaNames = text => AREAS.flatMap(area => area.links(text).map(link => area.dir + '/' + link.name));

export async function plainMediaChoice({folder, store, file, id, path, guard = () => {}}) {
	const privacy = await lockedSyncBoundary(folder, guard); guard = privacy.guard;
	const {area, name} = mediaPath(path);
	if (!await privacy.allows(file) || !await privacy.allows(path) || typeof store.area !== 'function') throw stale();
	const note = await folder.readCanonical({file, id});
	if (note.index.notes[file]?.trashed || !area.links(note.text).some(link => link.name === name)) throw stale();
	await guard();
	const local = await identity(await folder.store.read(path)), remote = await store.area(area.dir).get(name);
	if (!remote || typeof remote.rev !== 'string' || !remote.rev) throw stale();
	const other = await identity(remote.bytes);
	if (sameContent(local, other)) throw stale();
	await guard();
	return {kind: 'media', file, id: note.id, digest: note.digest, ledger: note.ledger.sha256, path, local, remote: {...other, rev: remote.rev}};
}

export async function resolvePlainMedia({folder, store, choice, guard = () => {}, now = Date.now}) {
	choice = structuredClone(choice);
	if (!['local', 'remote'].includes(choice.version)) throw stale();
	const {file, id, path} = choice, {area, name} = mediaPath(path);
	const privacy = await lockedSyncBoundary(folder, guard); guard = privacy.guard;
	if (!await privacy.allows(file) || !await privacy.allows(path) || typeof store.area !== 'function') throw stale();
	const remote = store.area(area.dir);
	const matches = current => current.id === id && current.digest === choice.digest && current.ledger === choice.ledger &&
		sameContent(current.local, choice.local) && sameContent(current.remote, choice.remote) && current.remote.rev === choice.remote.rev;
	if (!matches(await plainMediaChoice({folder, store, file, id, path, guard}))) throw stale();
	const localBytes = await folder.store.read(path), remoteFile = await remote.get(name);
	if (!sameContent(await identity(localBytes), choice.local) || !remoteFile || remoteFile.rev !== choice.remote.rev ||
		!sameContent(await identity(remoteFile.bytes), choice.remote)) throw stale();
	const extension = /\.[a-z0-9]{1,24}$/i.exec(name)?.[0] || '';
	const copies = Object.fromEntries(['local', 'remote'].map(version => [version, area.dir + '/sync-' + choice[version].hash + extension]));
	for (const [version, bytes] of [['local', localBytes], ['remote', remoteFile.bytes]]) {
		const kept = copies[version], copyName = kept.slice(area.dir.length + 1);
		await guard();
		if (!await privacy.allows(kept)) throw stale();
		let here = await folder.store.read(kept);
		if (here == null) { await area.create(folder, copyName, bytes, guard); here = await folder.store.read(kept); }
		if (!sameContent(await identity(here), choice[version])) throw stale();
		let there = await remote.get(copyName);
		if (!there) {
			await guard();
			try { await remote.put(copyName, bytes, {ifAbsent: true}); }
			catch (error) { if (error?.code !== 'conflict') throw error; }
			there = await remote.get(copyName);
		}
		if (!there || !sameContent(await identity(there.bytes), choice[version])) throw stale();
	}
	const selected = copies[choice.version];
	const admit = async () => {
		await guard();
		if (!sameContent(await identity(await folder.store.read(path)), choice.local)) throw stale();
		for (const version of ['local', 'remote']) {
			if (!sameContent(await identity(await folder.store.read(copies[version])), choice[version])) throw stale();
			const got = await remote.get(copies[version].slice(area.dir.length + 1));
			if (!got || !sameContent(await identity(got.bytes), choice[version])) throw stale();
		}
		const got = await remote.get(name);
		if (!got || got.rev !== choice.remote.rev || !sameContent(await identity(got.bytes), choice.remote)) throw stale();
		await guard();
	};
	await admit();
	const lease = await folder.owner.acquire(folder.scope);
	try {
		let next;
		const result = await lease.transact(async ({index, bodies}) => {
			const bytes = bodies.get(file), entry = index.notes[file];
			if (!bytes || entry?.id !== id || entry.trashed || entry.canonicalHistory !== choice.ledger || await digest(bytes) !== choice.digest) throw stale();
			const current = td.decode(bytes);
			if (!area.links(current).some(link => link.name === name)) throw stale();
			next = area.rewrite(current, new Map([[name, selected.slice(area.dir.length + 1)]]));
			if (next === current) throw stale();
			const plan = await folder.planCanonicalChange(index, {file, current, next, operation: 'notes.sync.media', now: now(), wholeReferences: true});
			const history = plan.writes.find(row => row.file === 'history/' + manifestName(id));
			const proof = parseCanonical(history?.bytes, {noteId: id, text: next, now: now()});
			proof.manifest.media = bindMedia(proof.ledger, proof.manifest.media, path, choice.local.hash, mediaNames);
			proof.manifest.media = bindMedia(proof.ledger, proof.manifest.media, selected, choice[choice.version].hash, mediaNames);
			history.bytes = exactBytes(serializeManifest(proof.manifest));
			return {kind: 'sync-media-choice', index, writes: [{file, bytes: exactBytes(next), expectedDigest: choice.digest}, ...plan.writes], canonical: plan.canonical};
		}, {bodies: [file], admissionGuard: admit});
		if (result.dropped?.includes(file) || td.decode(await folder.store.read(file)) !== next) throw stale();
		const proof = parseCanonical(await folder.store.read('history/' + manifestName(id)), {noteId: id, text: next, now: now()});
		const act = proof.ledger.records.at(-1)?.transaction;
		if (act?.operation !== 'notes.sync.media' || result.index.notes[file]?.canonicalHistory !== proof.ledger.sha256) throw stale();
		return {...result, file, id, text: next, digest: proof.ledger.head.sha256, ledger: proof.ledger, act, media: {...copies, selected}};
	} finally { await lease.release(); }
}

export async function syncPlainMedia({folder, store, base, guard = () => {}}) {
	await guard();
	const privacy = await lockedSyncBoundary(folder, guard); guard = privacy.guard;
	const result = {pushed: 0, pulled: 0, removed: 0, held: []};
	if (typeof store.area !== 'function') return {...result, skipped: 'this storage keeps notes only'};
	const stored = await base.read() || {}, storedText = JSON.stringify(stored), agreed = new Map(Object.entries(stored));
	for (const [path] of agreed) if (!await privacy.allows(path)) agreed.delete(path);
	const hold = (path, why) => result.held.push({name: path, why});
	let linked = null;
	async function isLinked(area, name) {
		if (!linked) {
			linked = new Map(AREAS.map(row => [row.dir, new Set()]));
			const {index} = await folder.read();
			for (const [file, entry] of Object.entries(index.notes || {})) {
				if (entry.trashed === true) continue;
				const bytes = await folder.store.read(file);
				if (!bytes) continue;
				const text = new TextDecoder().decode(bytes);
				for (const row of AREAS) for (const link of row.links(text)) linked.get(row.dir).add(link.name);
			}
		}
		return linked.get(area.dir).has(name);
	}
	for (const area of AREAS) {
		const remote = store.area(area.dir);
		if (!remote) continue;
		if (typeof remote.connect === 'function') await remote.connect();
		const at = name => area.dir + '/' + name;
		const theirs = new Map((await remote.list()).filter(row => area.valid(row.name)).map(row => [row.name, row]));
		for (const [name] of theirs) if (!await privacy.allows(at(name))) theirs.delete(name);
		const local = async () => {
			const names = new Set((await folder.store.list(area.dir)).filter(area.valid));
			for (const name of names) if (!await privacy.allows(at(name))) names.delete(name);
			return names;
		};
		let mine = await local();
		const read = name => folder.store.read(at(name));
		async function push(name, condition = {ifAbsent: true}) {
			await guard();
			const bytes = await read(name);
			if (!bytes) return hold(at(name), 'missing');
			if (bytes.length > MAX_BYTES) return hold(at(name), 'too_large');
			try { const put = await remote.put(name, bytes, condition); agreed.set(at(name), {rev: put.rev, hash: await digest(bytes)}); result.pushed++; }
			catch (error) { if (error?.code === 'conflict') hold(at(name), 'conflict'); else throw error; }
		}
		async function pull(name) {
			await guard();
			const got = await remote.get(name);
			if (!got) return hold(at(name), 'missing');
			await guard();
			await area.create(folder, name, got.bytes, guard);
			agreed.set(at(name), {rev: got.rev, hash: await digest(got.bytes)}); result.pulled++;
		}
		for (const [path, was] of [...agreed]) {
			if (!path.startsWith(area.dir + '/')) continue;
			const name = path.slice(area.dir.length + 1);
			const here = mine.has(name), there = theirs.get(name);
			if (here && there) {
				if (there.rev !== was.rev) {
					const got = await remote.get(name);
					if (got && await digest(got.bytes) === was.hash) agreed.set(path, {rev: got.rev, hash: was.hash});
					else hold(path, 'changed there');
				}
				continue;
			}
			if (!here && !there) { agreed.delete(path); continue; }
			if (!here) {
				if (there.rev === was.rev) {
					try { if (await remote.remove(name, {ifRev: was.rev})) result.removed++; agreed.delete(path); }
					catch (error) { if (error?.code === 'conflict') hold(path, 'conflict'); else throw error; }
				} else { agreed.delete(path); await pull(name); }
				continue;
			}
			agreed.delete(path);
			if (await isLinked(area, name)) await push(name);
		}
		for (const [name] of theirs) {
			if (agreed.has(at(name))) continue;
			if (mine.has(name)) {
				const [got, bytes] = [await remote.get(name), await read(name)];
				if (got && bytes && await digest(got.bytes) === await digest(bytes)) agreed.set(at(name), {rev: got.rev, hash: await digest(bytes)});
				else hold(at(name), 'taken');
				continue;
			}
			try { await pull(name); }
			catch (error) { if (error?.code === 'collision') hold(at(name), 'taken'); else throw error; }
		}
		mine = await local();
		for (const name of mine) if (!agreed.has(at(name)) && !theirs.has(name)) await push(name);
	}
	await guard();
	const settled = Object.fromEntries(agreed);
	if (JSON.stringify(settled) !== storedText) await base.write(settled);
	return result;
}
