// SPDX-License-Identifier: AGPL-3.0-only
// Disposable joint search/link rows, never note storage. The pure stamp decision stays in search-store.
// One database across scopes AND projection versions: changing versions cannot accumulate databases.
import {stampFor, stampsMatch, stampDurable, planIndexReuse} from './search-store.mjs';
import {packSearchProjection, unpackSearchProjection} from './search.mjs';
import {packLinkProjection, unpackLinkProjection} from './links.mjs';

// Replaced from the assembled dependency graph, shell and verified parser identities by build.mjs.
// Direct, unbuilt imports fail closed unless a witness supplies the identity of the code it runs.
export const SEARCH_CACHE_VERSION = '__RAPIER_SEARCH_CACHE_VERSION__';
// Budget 872 bytes/row (D09): about 47,702 rows. A charge, not a disk claim, never a note limit.
export const SEARCH_CACHE_LIMITS = Object.freeze({bytes: 50_000 * 832, batchBytes: 256 * 832, batchRows: 256});
const DATABASE = 'rapier-notes-search', STORE = 'rows', META = 'account';
const uint = n => Number.isSafeInteger(n) && n >= 0;
const validFile = file => typeof file === 'string' && file.length > 0;
export function searchCacheRowBytes(row) {
	return 2 * (JSON.stringify(row.key).length + row.scope.length + row.encoded.length) + 8;
}

// Scheduling moves IDB puts out of the indexing call; marshalling a bounded row is STILL main-
// thread work. No browser/paint-time guarantee follows from a Node witness. No unload flush.
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
					// This is cache construction, not schema migration. An unknown physical shape is
					// refused by normal transactions; projection changes use the content key instead.
					const rows = request.result.createObjectStore(STORE, {keyPath: 'key'});
					rows.createIndex('scope', 'scope'); rows.createIndex('age', 'age');
				} catch (_) { try { request.transaction.abort(); } catch (_) {} finish(null); }
			};
			request.onerror = () => finish(null);
			request.onblocked = () => finish(null);
			request.onsuccess = () => {
				// A blocked/failed open can succeed later. It must not resurrect this cache or keep
				// an unseen connection open, blocking another page's clear/versionchange.
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

	// Only transaction COMPLETE publishes a result. A request succeeding before an abort proves
	// nothing, for reads or writes. Exceptions inside request callbacks abort the same transaction.
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
			if (!head || !uint(head.bytes) || !uint(head.clock) || head.clock > Number.MAX_SAFE_INTEGER - batch.length) {
				// Missing accounting (cleared origin), malformed accounting, or exhausted exact
				// integer space: discard this cache, never adapt unknown rows.
				rows.clear(); head = {key: META, bytes: 0, clock: 0};
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
		// Bounded even when the host never grants idle time. The newest projection wins; losing a
		// queued cache write costs a read next session, never a note or a current search result.
		while (pendingBytes + charge > bound.bytes && pending.size) {
			const [name, first] = pending.entries().next().value;
			pending.delete(name); pendingBytes -= cost(first);
		}
		pending.set(file, row); pendingBytes += charge; arm(); return active;
	};
	const drop = file => validFile(file) && queue({key: [scope, file], scope, encoded: null});
	const read = async () => {
		const read = await transaction('readonly', (rows, result, guard) => {
			const request = rows.index('scope').getAll(scope);
			request.onsuccess = guard(() => result(request.result));
		});
		const found = new Map();
		if (!read) return found;
		try {
			let bytes = 0;
			for (const row of read.value) {
				if (!row || row.scope !== scope || !Array.isArray(row.key) || row.key.length !== 2 || row.key[0] !== scope ||
					!validFile(row.key[1]) || typeof row.encoded !== 'string' || !uint(row.age)) continue;
				bytes += searchCacheRowBytes(row);
				if (bytes > bound.bytes) { fail(); return new Map(); }
				let value;
				try { value = JSON.parse(row.encoded); } catch (_) { drop(row.key[1]); continue; }
				if (!Array.isArray(value) || value.length !== 6 || value[0] !== version) { drop(row.key[1]); continue; }
				const stamp = stampFor({size: value[1], modified: value[2]}), search = unpackSearchProjection(value[3]);
				const links = stamp && unpackLinkProjection(value[4], stamp.size);
				// A row earns coverage for BOTH owners or neither. A valid search half is not a hit.
				if (!stamp || !search || !links) { drop(row.key[1]); continue; }
				// R87i I06: `null` is a row from before titles, distinct from '' (a real untitled note).
				const title = value[5];
				if (title !== null && typeof title !== 'string') { drop(row.key[1]); continue; }
				found.set(row.key[1], {...stamp, projection: {search, links, ...(title === null ? {} : {title})}});
			}
			return active ? found : new Map();
		} catch (_) { fail(); return new Map(); }
	};
	return {
		read,
		async plan(folder) {
			const plan = planIndexReuse(folder, await read());
			for (const file of plan.drop) drop(file);
			return plan;
		},
		// The two stamps bracket the actual body read (or are the same File snapshot's stamp).
		// A stat taken only AFTER the body must never certify older bytes under a newer stamp.
		// observedAt is captured BEFORE acquiring those bytes/stamps, not here or at idle commit.
		// An unearned observation must be read again later, never re-labelled with a later clock.
		remember(file, projection, before, after, observedAt) {
			if (!active || !validFile(file)) return false;
			const stamp = stampFor(before);
			if (!stampsMatch(stamp, stampFor(after)) || !stampDurable(stamp, observedAt)) return false;
			try {
				const search = packSearchProjection(projection.search), links = packLinkProjection(projection.links, stamp.size);
				// I06: the CARD's title, never search's; unknown writes null.
				const title = typeof projection.title === 'string' ? projection.title : null;
				const encoded = JSON.stringify([version, stamp.size, stamp.modified, search, links, title]);
				return queue({key: [scope, file], scope, encoded});
			} catch (_) { return false; }
		},
		drop,
		// For an explicit caller/test, not search, paint, Save, or unload. Does not force idle work.
		settled() { return !active || (!pending.size && !running) ? Promise.resolve(active) : new Promise(resolve => waiters.push(resolve)); },
		close: fail,
		get active() { return active; },
		get queuedBytes() { return pendingBytes; },
	};
}
