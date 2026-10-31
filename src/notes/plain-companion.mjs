// SPDX-License-Identifier: AGPL-3.0-only
import {fail, isProviderRefusal, refuse} from './provider-http.mjs';
import {plainConflict, plainName, plainBytes} from './plain-store.mjs';

export const PLAIN_CAPABILITY = 'plain.files';
const CHUNK = 128 * 1024, MAX_BYTES = 150000000;
const ID = /^[a-f0-9]{32}$/, REV = /^[\x21-\x7e]{1,256}$/;
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const CODES = Object.freeze({NOT_CONFIGURED: 'config', PRO_REQUIRED: 'pro_required', AUTH: 'auth', PERMISSION: 'permission', RATE: 'rate', SERVER: 'server',
	NETWORK: 'network', UNCONFIRMED: 'network', PAUSED: 'cancelled', BUSY: 'rate', TOO_LARGE: 'too_large', DIGEST: 'response', PROTOCOL: 'protocol', CAPABILITY: 'capability', AUTHORITY: 'authority'});

export function createCompanionPlainStore({call, destination, area = 'notes', cancellation} = {}) {
	if (typeof call !== 'function') refuse('config', 'this device has no rapier sync seam');
	if (!ID.test(destination || '')) refuse('config', 'open rapier sync and choose the folder for plain files');
	if (!['notes', 'attachments', 'audio'].includes(area)) refuse('config', 'plain files keep notes, their attachments and their recordings only');
	const owner = cancellation || {paused: false, epoch: 0, pending: new Set(), pauseFlight: null};
	const guard = (ticket, allowPaused = false) => { if (ticket !== owner.epoch || owner.paused && !allowPaused) refuse('cancelled', 'sync is paused; local work is kept'); };
	function track(action) {
		const task = Promise.resolve().then(action);
		owner.pending.add(task);
		task.then(() => owner.pending.delete(task), () => owner.pending.delete(task));
		return task;
	}
	const run = action => { const ticket = owner.epoch; return track(async () => { guard(ticket); const answer = await action(ticket); guard(ticket); return answer; }); };
	function pause() {
		owner.paused = true; owner.epoch++; owner.resumed = false;
		const native = owner.pauseFlight || Promise.resolve().then(() => call('pause', {}));
		const drained = Promise.allSettled([...owner.pending]);
		owner.pauseFlight = Promise.allSettled([native, drained]).then(([result]) => { if (result.status === 'rejected') throw result.reason; });
		owner.pauseFlight.catch(() => {});
		return owner.pauseFlight;
	}
	function resume() {
		const ticket = owner.epoch, stopped = owner.pauseFlight;
		return track(async () => {
			if (stopped) await stopped;
			guard(ticket, true); owner.paused = false; owner.pauseFlight = null;
			const answer = await ask('resume', {area: 'notes'}, ticket);
			if (!Number.isSafeInteger(answer.verifiedObjects) || answer.verifiedObjects < 0 || !Number.isSafeInteger(answer.keptObjects) || answer.keptObjects < 0) refuse('response', 'rapier sync answered in an unreadable form');
			owner.resumed = true;
			return answer;
		});
	}
	async function ask(operation, args, ticket) {
		guard(ticket);
		let answer;
		try { answer = await call(operation, {destination, area, ...args}); }
		catch (error) {
			guard(ticket);
			if (isProviderRefusal(error)) throw error;
			const code = /\(([A-Z_]{1,32})\)$/.exec(String(error?.message || ''))?.[1] || error?.refused;
			if (code === 'CONFLICT') throw plainConflict();
			if (code === 'CAPABILITY') throw fail('capability', 'update rapier sync to keep plain files; nothing was sent.');
			if (code === 'NOT_CONFIGURED') throw fail('config', 'open rapier sync and choose the folder for plain files; nothing was sent.');
			throw fail(CODES[code] || 'network', 'rapier sync did not finish this file; your notes are kept.');
		}
		try { guard(ticket); } catch (error) {
			if (['plain.get.begin', 'plain.put.begin'].includes(operation) && ID.test(answer?.transfer || '')) {
				try { await call('cancel', {transfer: answer.transfer}); } catch {}
			}
			throw error;
		}
		return answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : refuse('response', 'rapier sync answered in an unreadable form');
	}
	const transferId = value => typeof value === 'string' && ID.test(value) ? value : refuse('response', 'rapier sync answered in an unreadable form');
	return Object.freeze({
		pause, resume,
		async beginPoll() { if (!owner.resumed) await resume(); owner.polling = true; owner.resumed = false; },
		endPoll() { owner.polling = false; owner.resumed = false; },
		area: area === 'notes' ? name => createCompanionPlainStore({call, destination, area: name, cancellation: owner}) : undefined,
		list: () => run(async ticket => {
			if (!owner.polling) { if (!owner.resumed) await resume(); owner.resumed = false; }
			const page = await ask('plain.list', {}, ticket);
			if (!Array.isArray(page.files) || page.files.length > 100000) refuse('response', 'the listing is not readable');
			const seen = new Set();
			return page.files.map(row => {
				if (!row || !REV.test(row.rev || '') || !Number.isSafeInteger(row.size) || row.size < 0 || seen.has(row.name)) refuse('authority', 'the listing named a file outside the folder');
				seen.add(plainName(row.name));
				return {name: row.name, rev: row.rev, size: row.size};
			});
		}),
		get: name => run(async ticket => {
			plainName(name);
			const begun = await ask('plain.get.begin', {name}, ticket);
			if (begun.missing === true) return null;
			const transfer = transferId(begun.transfer);
			try {
				if (!Number.isSafeInteger(begun.size) || begun.size < 0 || begun.size > MAX_BYTES || !REV.test(begun.rev || '') || !/^[a-f0-9]{64}$/.test(begun.sha256 || '')) refuse('response', 'rapier sync answered in an unreadable form');
				const bytes = new Uint8Array(begun.size);
				for (let at = 0; at < begun.size; at += CHUNK) {
					const count = Math.min(CHUNK, begun.size - at), got = await ask('plain.get.chunk', {transfer, offset: at, size: count}, ticket);
					if (got.offset !== at || !(got.bytes instanceof Uint8Array) || got.bytes.length !== count) refuse('response', 'rapier sync did not return this file whole');
					bytes.set(got.bytes, at);
				}
				if (await sha256(bytes) !== begun.sha256) refuse('response', 'the file did not arrive whole');
				return {bytes, rev: begun.rev};
			} finally { try { await call('plain.get.end', {transfer}); } catch {} }
		}),
		put: (name, bytes, condition = {}) => run(async ticket => {
			plainName(name); plainBytes(bytes, MAX_BYTES);
			const when = condition.ifAbsent === true ? {ifAbsent: true} : REV.test(condition.ifRev || '') ? {ifRev: condition.ifRev} : refuse('conditional', 'a plain file is written only as new or over the revision last read');
			const digest = await sha256(bytes);
			const transfer = transferId((await ask('plain.put.begin', {name, size: bytes.length, sha256: digest, ...when}, ticket)).transfer);
			try {
				for (let at = 0; at < bytes.length; at += CHUNK) {
					const chunk = bytes.subarray(at, Math.min(bytes.length, at + CHUNK)), got = await ask('plain.put.chunk', {transfer, offset: at, bytes: chunk}, ticket);
					if (got.offset !== at + chunk.length) refuse('response', 'rapier sync did not receive this file whole');
				}
				const done = await ask('plain.put.end', {transfer}, ticket);
				if (done.sha256 !== digest || done.size !== bytes.length || !REV.test(done.rev || '')) refuse('response', 'rapier sync confirmed another file');
				return {rev: done.rev};
			} catch (error) { try { await call('cancel', {transfer}); } catch {} throw error; }
		}),
		remove: (name, {ifRev} = {}) => run(async ticket => {
			plainName(name);
			if (!REV.test(ifRev || '')) refuse('conditional', 'a plain file is removed only at the revision last read');
			const done = await ask('plain.remove', {name, ifRev}, ticket);
			if (typeof done.removed !== 'boolean') refuse('response', 'rapier sync answered in an unreadable form');
			return done.removed;
		}),
	});
}
