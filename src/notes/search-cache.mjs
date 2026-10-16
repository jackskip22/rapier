// SPDX-License-Identifier: AGPL-3.0-only
import {stampFor, stampsMatch, stampDurable, planIndexReuse} from './search-store.mjs';
import {packSearchProjection, unpackSearchProjection} from './search.mjs';
import {packLinkProjection, unpackLinkProjection} from './links.mjs';

const SEARCH_CACHE_VERSION = '__RAPIER_SEARCH_CACHE_VERSION__';
export const SEARCH_CACHE_LIMITS = Object.freeze({bytes: 50_000 * 832, batchBytes: 256 * 832, batchRows: 256});
const DATABASE = 'rapier-notes-search', STORE = 'rows', META = 'account';
const uint = n => Number.isSafeInteger(n) && n >= 0;
const validFile = file => typeof file === 'string' && file.length > 0;
export function searchCacheRowBytes(row) {
	return 2 * (JSON.stringify(row.key).length + row.scope.length + row.version.length + (row.title || '').length + row.encoded.length) + 24;
}

export function takeSearchCacheProjection(row) {
	const pending = row?.projection;
	if (!pending) return null;
	const encoded = pending.encoded;
	delete pending.encoded;
	if (typeof encoded !== 'string' || 2 * encoded.length > Math.min(SEARCH_CACHE_LIMITS.bytes, SEARCH_CACHE_LIMITS.batchBytes) || !stampFor(row)) return null;
	try {
		const value = JSON.parse(encoded);
		if (!Array.isArray(value) || value.length !== 2) return null;
		const search = unpackSearchProjection(value[0]), links = unpackLinkProjection(value[1], row.size);
		if (!search || !links || pending.title !== undefined && typeof pending.title !== 'string') return null;
		return {search, links, ...(pending.title === undefined ? {} : {title: pending.title})};
	} catch (_) { return null; }
}

function scheduleWrite(run) {
	if (typeof globalThis.requestIdleCallback === 'function') {
		const id = globalThis.requestIdleCallback(run);
		return () => globalThis.cancelIdleCallback?.(id);
	}
	const id = globalThis.setTimeout(run, 0);
	return () => globalThis.clearTimeout(id);
}

function connect(factory) {
	return new Promise(resolve => {
		let request, settled = false;
		const finish = value => { if (!settled) { settled = true; resolve(value); } };
		try {
			const idb = typeof factory === 'function' ? factory() : factory;
			if (!idb) { finish(null); return; }
			request = idb.open(DATABASE, 1);
			request.onupgradeneeded = () => {
				try {
					const rows = request.result.createObjectStore(STORE, {keyPath: 'key'});
					rows.createIndex('scope', 'scope'); rows.createIndex('age', 'age');
				} catch (_) { try { request.transaction.abort(); } catch (_) {} finish(null); }
			};
			request.onerror = () => finish(null);
			request.onblocked = () => finish(null);
			request.onsuccess = () => {
				if (settled) { request.result.close(); return; }
				finish(request.result);
			};
		} catch (_) { finish(null); }
	});
}

export async function openSearchCache({scope, version = SEARCH_CACHE_VERSION,
	factory = () => globalThis.indexedDB, schedule = scheduleWrite, limits = SEARCH_CACHE_LIMITS} = {}) {
	let db = null, active = validFile(scope) && /^[a-f0-9]{64}$/.test(version) &&
		['bytes', 'batchBytes', 'batchRows'].every(k => uint(limits?.[k]) && limits[k] > 0 && limits[k] <= SEARCH_CACHE_LIMITS[k]);
	const bound = {...limits}, pending = new Map(), waiters = [];
	let pendingBytes = 0, cancel = null, running = false;
	const notify = ok => { for (const resolve of waiters.splice(0)) resolve(ok); };
	const fail = () => {
		active = false; pending.clear(); pendingBytes = 0;
		try { cancel?.(); } catch (_) {} cancel = null;
		try { db?.close(); } catch (_) {} db = null;
		notify(false);
	};
	if (active) { db = await connect(factory); if (!db) active = false; }
	if (db) { db.onversionchange = fail; db.onclose = fail; }

	const transaction = (mode, work) => new Promise(resolve => {
		if (!active || !db) { resolve(null); return; }
		let tx, result;
		const broken = () => { fail(); resolve(null); };
		try {
			tx = db.transaction(STORE, mode);
			tx.onabort = broken; tx.onerror = () => fail();
			tx.oncomplete = () => resolve(active ? {value: result} : null);
			const guard = fn => (...args) => { try { fn(...args); } catch (_) { try { tx.abort(); } catch (_) {} broken(); } };
			work(tx.objectStore(STORE), value => { result = value; }, guard);
		} catch (_) { try { tx?.abort(); } catch (_) {} broken(); }
	});

	const commit = batch => transaction('readwrite', (rows, result, guard) => {
		const account = rows.get(META);
		account.onsuccess = guard(() => {
			let head = account.result;
			if (!head || head.version !== version || !uint(head.bytes) || !uint(head.clock) || head.clock > Number.MAX_SAFE_INTEGER - batch.length) {
				rows.clear(); head = {key: META, version, bytes: 0, clock: 0};
			} else head = {...head};
			const finish = () => {
				if (!uint(head.bytes)) throw new Error('invalid cache accounting');
				rows.put(head); result(true);
			};
			const trim = () => {
				if (head.bytes <= bound.bytes) { finish(); return; }
				const request = rows.index('age').openCursor();
				request.onsuccess = guard(() => {
					const cursor = request.result;
					if (!cursor) throw new Error('cache accounting has no rows');
					head.bytes -= searchCacheRowBytes(cursor.value); cursor.delete();
					if (head.bytes > bound.bytes) cursor.continue(); else finish();
				});
			};
			let left = batch.length;
			for (const row of batch) {
				const previous = rows.get(row.key);
				previous.onsuccess = guard(() => {
					if (previous.result) head.bytes -= searchCacheRowBytes(previous.result);
					if (row.encoded === null) rows.delete(row.key);
					else {
						const saved = {...row, age: ++head.clock};
						head.bytes += searchCacheRowBytes(saved); rows.put(saved);
					}
					if (--left === 0) trim();
				});
			}
		});
	});

	const pump = async () => {
		cancel = null;
		if (!active || running) return;
		running = true;
		const batch = []; let bytes = 0;
		for (const [file, row] of pending) {
			const charge = row.encoded === null ? 2 * JSON.stringify(row.key).length : searchCacheRowBytes(row);
			if (batch.length && (batch.length >= bound.batchRows || bytes + charge > bound.batchBytes)) break;
			batch.push(row); bytes += charge; pending.delete(file); pendingBytes -= charge;
		}
		if (batch.length) await commit(batch);
		running = false;
		if (active && pending.size) arm(); else notify(active);
	};
	const arm = () => {
		if (!active || cancel || running || !pending.size) return;
		try { cancel = schedule(() => { void pump(); }); }
		catch (_) { fail(); }
	};
	const queue = row => {
		if (!active) return false;
		const file = row.key[1], cost = value => value.encoded === null ? 2 * JSON.stringify(value.key).length : searchCacheRowBytes(value);
		const charge = cost(row);
		if (charge > Math.min(bound.bytes, bound.batchBytes)) return false;
		const old = pending.get(file);
		if (old) { pendingBytes -= cost(old); pending.delete(file); }
		while (pendingBytes + charge > bound.bytes && pending.size) {
			const [name, first] = pending.entries().next().value;
			pending.delete(name); pendingBytes -= cost(first);
		}
		pending.set(file, row); pendingBytes += charge; arm(); return active;
	};
	const drop = file => validFile(file) && queue({key: [scope, file], scope, encoded: null});
	const read = async () => {
		const read = await transaction('readonly', (rows, result, guard) => {
			const account = rows.get(META);
			account.onsuccess = guard(() => {
				const head = account.result;
				if (!head || head.version !== version || !uint(head.bytes) || !uint(head.clock)) { result([]); return; }
				const request = rows.index('scope').getAll(scope);
				request.onsuccess = guard(() => result(request.result));
			});
		});
		const found = new Map();
		if (!read) return found;
		try {
			let bytes = 0;
			for (const row of read.value) {
				if (!row || row.scope !== scope || !Array.isArray(row.key) || row.key.length !== 2 || row.key[0] !== scope ||
					!validFile(row.key[1]) || typeof row.encoded !== 'string' || !uint(row.age)) continue;
				const stamp = stampFor(row), title = row.title;
				if (row.version !== version || !stamp || title !== null && typeof title !== 'string') { drop(row.key[1]); continue; }
				bytes += searchCacheRowBytes(row);
				if (bytes > bound.bytes) { fail(); return new Map(); }
				found.set(row.key[1], {...stamp, projection: {encoded: row.encoded, ...(title === null ? {} : {title})}});
			}
			return active ? found : new Map();
		} catch (_) { fail(); return new Map(); }
	};
	return {
		read,
		take(row) {
			const projection = takeSearchCacheProjection(row);
			if (!projection) drop(row.file);
			return projection;
		},
		async plan(folder) {
			const plan = planIndexReuse(folder, await read());
			for (const file of plan.drop) drop(file);
			return plan;
		},
		remember(file, projection, before, after, observedAt) {
			if (!active || !validFile(file)) return false;
			const stamp = stampFor(before);
			if (!stampsMatch(stamp, stampFor(after)) || !stampDurable(stamp, observedAt)) return false;
			try {
				const title = typeof projection.title === 'string' ? projection.title : null;
				if (typeof projection.encoded === 'string')
					return queue({key: [scope, file], scope, version, ...stamp, title, encoded: projection.encoded});
				const note = projection.search, outgoing = projection.links;
				let minimum = (note.title?.length || 0) + (note.excerpt?.length || 0) +
					4 * note.headings.length + 2 * note.tags.length + 30 * outgoing.out.length + 2 * outgoing.aliases.length;
				for (const field of ['title', 'headings', 'tags', 'body']) minimum += 6 * note.bag[field].size;
				if (note.pictures && note.bag.pictures) minimum += note.pictures.length + 6 * note.bag.pictures.size;
				if (2 * minimum > Math.min(bound.bytes, bound.batchBytes)) return false;
				const search = packSearchProjection(projection.search), links = packLinkProjection(projection.links, stamp.size);
				const encoded = JSON.stringify([search, links]);
				return queue({key: [scope, file], scope, version, ...stamp, title, encoded});
			} catch (_) { return false; }
		},
		drop,
		settled() { return !active || (!pending.size && !running) ? Promise.resolve(active) : new Promise(resolve => waiters.push(resolve)); },
		close: fail,
		get active() { return active; },
		get queuedBytes() { return pendingBytes; },
	};
}
