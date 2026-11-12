// SPDX-License-Identifier: AGPL-3.0-only
import {stampFor, stampsMatch, stampDurable, planIndexReuse, contentIdFor} from './search-store.mjs';
import {packSearchProjection, unpackSearchProjection} from './search.mjs';
import {packLinkProjection, unpackLinkProjection} from './links.mjs';

const SEARCH_CACHE_VERSION = '__RAPIER_SEARCH_CACHE_VERSION__';
export const SEARCH_CACHE_LIMITS = Object.freeze({bytes: 50_000 * 832, batchBytes: 256 * 832, batchRows: 256});
const DATABASE = 'rapier-notes-search', STORE = 'rows', META = 'account', CACHE_WAIT_MS = 1000, CACHE_SLICE = 32;
const uint = n => Number.isSafeInteger(n) && n >= 0;
const validFile = file => typeof file === 'string' && file.length > 0;
function breathe() {
	return new Promise(resolve => { if (typeof setTimeout === 'function') setTimeout(resolve, 0); else queueMicrotask(resolve); });
}
export function searchCacheRowBytes(row) {
	return 2 * (JSON.stringify(row.key).length + row.scope.length + row.version.length + (row.contentId || '').length + (row.title || '').length + row.encoded.length) + 24;
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
		let request, timer, settled = false;
		const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
		timer = setTimeout(() => finish(null), CACHE_WAIT_MS);
		try {
			const idb = typeof factory === 'function' ? factory() : factory;
			if (!idb) { finish(null); return; }
			request = idb.open(DATABASE, 1);
			request.onupgradeneeded = () => {
				if (settled) { try { request.transaction.abort(); } catch (_) {} return; }
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
	factory = () => globalThis.indexedDB, schedule = scheduleWrite, limits = SEARCH_CACHE_LIMITS, contended} = {}) {
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

	const inputPending = () => { try { return !!(typeof contended === 'function' && contended()); } catch (_) { return false; } };
	const transaction = (mode, work) => new Promise(resolve => {
		if (!active || !db) { resolve(null); return; }
		let tx, result, timer, settled = false;
		const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
		const broken = () => { fail(); finish(null); };
		timer = setTimeout(() => { try { tx?.abort(); } catch (_) {} broken(); }, CACHE_WAIT_MS);
		try {
			tx = db.transaction(STORE, mode);
			tx.onabort = broken; tx.onerror = broken;
			tx.oncomplete = () => finish(active ? {value: result} : null);
			const guard = fn => (...args) => { if (!settled) try { fn(...args); } catch (_) { try { tx.abort(); } catch (_) {} broken(); } };
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
	const keepRow = (row, found, bytes) => {
		if (!row || row.scope !== scope || !Array.isArray(row.key) || row.key.length !== 2 || row.key[0] !== scope ||
			!validFile(row.key[1]) || typeof row.encoded !== 'string' || !uint(row.age)) return bytes;
		const stamp = stampFor(row), title = row.title;
		if (row.version !== version || !stamp || !contentIdFor(row) || title !== null && typeof title !== 'string') { drop(row.key[1]); return bytes; }
		bytes += searchCacheRowBytes(row);
		if (bytes > bound.bytes) { fail(); return -1; }
		found.set(row.key[1], {...stamp, projection: {encoded: row.encoded, ...(title === null ? {} : {title})}});
		return bytes;
	};
	const read = async () => {
		const found = new Map();
		if (!active) return found;
		try {
			const head = await transaction('readonly', (rows, result, guard) => {
				const account = rows.get(META);
				account.onsuccess = guard(() => {
					const value = account.result;
					result(!!value && value.version === version && uint(value.bytes) && uint(value.clock));
				});
			});
			if (!head?.value || !active) return new Map();
			let bytes = 0, after = null;
			for (;;) {
				if (found.size >= CACHE_SLICE || inputPending()) {
					do { await breathe(); if (!active) return new Map(); } while (inputPending());
				}
				const range = after == null ? globalThis.IDBKeyRange.bound([scope, ''], [scope, '\uffff']) : globalThis.IDBKeyRange.bound([scope, after], [scope, '\uffff'], true, false);
				const batch = await transaction('readonly', (rows, result, guard) => {
					const request = rows.openCursor(range), page = [];
					request.onsuccess = guard(() => {
						const cursor = request.result;
						if (!cursor || page.length >= CACHE_SLICE) { result(page); return; }
						page.push(cursor.value); cursor.continue();
					});
				});
				const page = batch?.value;
				if (!page?.length) break;
				for (const row of page) { bytes = keepRow(row, found, bytes); if (bytes < 0) return new Map(); }
				if (!active || page.length < CACHE_SLICE) break;
				after = page[page.length - 1]?.key?.[1];
				if (!after) break;
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
			const stored = active ? await read() : new Map();
			if (!active) return planIndexReuse(folder, new Map());
			const pause = async () => { do { await breathe(); if (!active) return; } while (inputPending()); };
			const decided = await planIndexReuse(folder, stored, {slice: CACHE_SLICE, pause});
			if (!active) return planIndexReuse(folder, new Map());
			for (const file of decided.drop) drop(file);
			return decided;
		},
		remember(file, projection, before, after, observedAt) {
			if (!active || !validFile(file)) return false;
			const stamp = stampFor(before);
			if (!contentIdFor(stamp) || stamp.contentId !== contentIdFor(after) || !stampsMatch(stamp, stampFor(after)) || !stampDurable(stamp, observedAt)) return false;
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
