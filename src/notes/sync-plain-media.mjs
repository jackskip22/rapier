// SPDX-License-Identifier: AGPL-3.0-only
import {isAttachmentName} from './model.mjs';
import {attachmentsOf} from './attachments.mjs';
import {validRecordingName, recordingsOf} from './audio.mjs';
import {lockedSyncBoundary} from './sync-state.mjs';

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const MAX_BYTES = 150000000;
const AREAS = Object.freeze([
	{dir: 'attachments', valid: isAttachmentName, links: attachmentsOf, create: (folder, name, bytes, guard) => folder.createAttachment(name, bytes, {exact: true, guard})},
	{dir: 'audio', valid: validRecordingName, links: recordingsOf, create: (folder, name, bytes) => folder.createAudio('Recording.md', '', bytes, name, {exact: true})},
]);

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
