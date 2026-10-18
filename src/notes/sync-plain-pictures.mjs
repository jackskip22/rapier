// SPDX-License-Identifier: AGPL-3.0-only
import {isAttachmentName} from './model.mjs';
import {attachmentsOf} from './attachments.mjs';

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const MAX_BYTES = 150000000;

export async function syncPlainPictures({folder, store, base, guard = () => {}}) {
	await guard();
	const result = {pushed: 0, pulled: 0, removed: 0, held: []};
	if (typeof store.pictures !== 'function') return {...result, skipped: 'this storage keeps notes only'};
	const remote = store.pictures(), agreed = new Map(Object.entries(await base.read() || {}));
	if (typeof remote.connect === 'function') await remote.connect();
	const hold = (name, why) => result.held.push({name, why});
	const theirs = new Map((await remote.list()).filter(row => isAttachmentName(row.name)).map(row => [row.name, row]));
	const local = async () => new Set((await folder.store.list('attachments')).filter(isAttachmentName));
	let mine = await local();
	const read = name => folder.store.read('attachments/' + name);
	const linked = new Set();
	const {index} = await folder.read();
	for (const [file, entry] of Object.entries(index.notes || {})) {
		if (entry.trashed === true) continue;
		const bytes = await folder.store.read(file);
		if (bytes) for (const row of attachmentsOf(new TextDecoder().decode(bytes))) linked.add(row.name);
	}
	async function push(name, condition = {ifAbsent: true}) {
		await guard();
		const bytes = await read(name);
		if (!bytes) return hold(name, 'missing');
		if (bytes.length > MAX_BYTES) return hold(name, 'too_large');
		try { const put = await remote.put(name, bytes, condition); agreed.set(name, {rev: put.rev, hash: await digest(bytes)}); result.pushed++; }
		catch (error) { if (error?.code === 'conflict') hold(name, 'conflict'); else throw error; }
	}
	async function pull(name) {
		await guard();
		const got = await remote.get(name);
		if (!got) return hold(name, 'missing');
		await guard();
		await folder.createAttachment(name, got.bytes, {exact: true, guard});
		agreed.set(name, {rev: got.rev, hash: await digest(got.bytes)}); result.pulled++;
	}
	for (const [name, was] of [...agreed]) {
		const here = mine.has(name), there = theirs.get(name);
		if (here && there) {
			if (there.rev !== was.rev) {
				const got = await remote.get(name);
				if (got && await digest(got.bytes) === was.hash) agreed.set(name, {rev: got.rev, hash: was.hash});
				else hold(name, 'changed there');
			}
			continue;
		}
		if (!here && !there) { agreed.delete(name); continue; }
		if (!here) {
			if (there.rev === was.rev) {
				try { if (await remote.remove(name, {ifRev: was.rev})) result.removed++; agreed.delete(name); }
				catch (error) { if (error?.code === 'conflict') hold(name, 'conflict'); else throw error; }
			} else { agreed.delete(name); await pull(name); }
			continue;
		}
		agreed.delete(name);
		if (linked.has(name)) await push(name);
	}
	for (const [name] of theirs) {
		if (agreed.has(name)) continue;
		if (mine.has(name)) {
			const [got, bytes] = [await remote.get(name), await read(name)];
			if (got && bytes && await digest(got.bytes) === await digest(bytes)) agreed.set(name, {rev: got.rev, hash: await digest(bytes)});
			else hold(name, 'taken');
			continue;
		}
		try { await pull(name); }
		catch (error) { if (error?.code === 'collision') hold(name, 'taken'); else throw error; }
	}
	mine = await local();
	for (const name of mine) if (!agreed.has(name) && !theirs.has(name)) await push(name);
	await guard();
	await base.write(Object.fromEntries(agreed));
	return result;
}
