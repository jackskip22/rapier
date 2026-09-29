// SPDX-License-Identifier: AGPL-3.0-only
const defaults = Object.freeze({concurrency:2, maxReadBytes:8*1024*1024, maxEntryBytes:4*1024*1024, maxCacheBytes:12*1024*1024, maxCacheEntries:48, maxWindowEntries:64});
const integer = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
const same = (a,b) => a.key === b.key && a.revision === b.revision && a.bytes === b.bytes;
const freeze = Object.freeze;
export const libraryReadRow = file => {
	if (typeof file?.key !== 'string' || !file.key || typeof file.revision !== 'string' || !file.revision || !integer(file.bytes)) throw new TypeError('card reads need folder identity, revision and byte length');
	return freeze({key:file.key, revision:file.revision, bytes:file.bytes});
};
export function createCardReads(options = {}) {
	const limits = {...defaults,...options};
	if (!Object.entries(limits).every(([key,n]) => integer(n,key === 'maxCacheBytes' ? 0 : 1)) || Object.entries(defaults).some(([key,n]) => limits[key] > n) || limits.maxEntryBytes > limits.maxReadBytes) throw new TypeError('card read limits must be bounded positive integers');
	return freeze({limits:freeze(limits), epoch:0, serial:0, wanted:freeze([]), active:freeze([]), cache:freeze([]), settled:freeze([])});
}
export function cardReadWindow(state, files) {
	if (!Array.isArray(files) || files.length > state.limits.maxWindowEntries) throw new RangeError('card read window exceeds its entry bound');
	const wanted = files.map(libraryReadRow), keys = new Set(wanted.map(f=>f.key));
	if (keys.size !== wanted.length) throw new TypeError('card read window repeats a file');
	if (state.epoch === Number.MAX_SAFE_INTEGER) throw new RangeError('card read epoch exhausted');
	const cache = state.cache.filter(c=>!keys.has(c.key) || wanted.some(f=>same(f,c)));
	// Old reads keep their reservations until their owner acknowledges completion or cancellation.
	return freeze({...state, epoch:state.epoch+1, wanted:freeze(wanted), cache:freeze(cache), settled:freeze([])});
}
export function cardReadUsage(state) {
	const readBytes = state.active.reduce((sum,r)=>sum+r.bytes,0), cacheBytes = state.cache.reduce((sum,r)=>sum+r.text.length*2,0);
	return {reads:state.active.length, readBytes, cacheBytes, cacheEntries:state.cache.length, reservedWorkingBytes:readBytes*3+cacheBytes};
}
export function planCardReads(state) {
	const active = state.active.slice(), settled = state.settled.slice(), start = []; let serial = state.serial;
	let held = active.reduce((sum,r)=>sum+r.bytes,0);
	for (const file of state.wanted) {
		if (state.cache.some(c=>same(c,file)) || settled.some(c=>same(c,file)) || active.some(c=>c.epoch===state.epoch&&same(c,file))) continue;
		if (file.bytes > state.limits.maxEntryBytes) { settled.push(freeze({...file,kind:'preview-too-large'})); continue; }
		if (active.length >= state.limits.concurrency || held+file.bytes > state.limits.maxReadBytes) continue;
		if (serial === Number.MAX_SAFE_INTEGER) throw new RangeError('card read ticket exhausted');
		const ticket = freeze({...file,ticket:++serial,epoch:state.epoch}); active.push(ticket); start.push(ticket); held+=file.bytes;
	}
	return {state:freeze({...state,serial,active:freeze(active),settled:freeze(settled)}), start, cancel:active.filter(r=>r.epoch!==state.epoch).map(r=>r.ticket)};
}
export function finishCardRead(state, ticket, result) {
	const work = state.active.find(r=>r.ticket===ticket); if (!work) return {state,accepted:false};
	const active = state.active.filter(r=>r.ticket!==ticket), wanted = state.wanted.find(r=>same(r,work));
	let next = freeze({...state,active:freeze(active)});
	if (work.epoch!==state.epoch || !wanted) return {state:next,accepted:false};
	let kind = 'read-failed';
	if (result && result.revision===work.revision && result.bytes===work.bytes && typeof result.text==='string') {
		if (result.text.length*2 > work.bytes*2) kind = 'read-length-mismatch';
		else {
			const entry = freeze({...wanted,text:result.text}), cache = state.cache.filter(c=>c.key!==work.key);
			cache.push(entry);
			let size = cache.reduce((sum,c)=>sum+c.text.length*2,0);
			while(cache.length && (size>state.limits.maxCacheBytes || cache.length>state.limits.maxCacheEntries)) { size-=cache[0].text.length*2; cache.shift(); }
			next = freeze({...next,cache:freeze(cache)}); kind='delivered';
		}
	} else if (result && !result.error) kind='stale-read';
	return {state:freeze({...next,settled:freeze([...state.settled,freeze({...wanted,kind})])}), accepted:kind==='delivered'};
}
export function cardReadStatus(state, file) {
	const wanted = libraryReadRow(file), cached = state.cache.find(c=>same(c,wanted));
	if (cached) return {kind:'ready',text:cached.text,editable:false};
	const settled = state.settled.find(c=>same(c,wanted));
	return {kind:settled?.kind || 'pending',label:wanted.key,editable:false};
}

// All shell consumers share only an outstanding read of this folder identity/revision. The
// injected operation owns I/O and acceptance; settling drops its promise, never caches its text.
// Preview admission remains the card planner's rule, not a limit on exact search/action reads.
export function createLibraryReadPass(read) {
	const active = new Map();
	const pass = file => {
		const wanted = libraryReadRow(file), prior = active.get(wanted.key);
		if (prior && same(prior, wanted)) return prior.promise;
		const work = {...wanted};
		active.set(wanted.key, work);
		// Keep the operation's promise: cleanup observes settlement without adding await hops to
		// the first card. Synchronous admission failures still have the same rejection contract.
		try { work.promise = Promise.resolve(read(wanted)); } catch (error) { work.promise = Promise.reject(error); }
		const retire = () => { if (active.get(wanted.key) === work) active.delete(wanted.key); };
		work.promise.then(retire, retire);
		return work.promise;
	};
	// A query must subscribe even when a card/background consumer already owns the physical read.
	// pass(row) joins that promise; excluding active rows here could leave the query with no receipt.
	pass.plan = planSearchReads;
	return pass;
}

// Confirmation priority is not result rank. Visible cards go first in their current screen order;
// the search owner's ranked candidates follow, then only the rest that the shared pass has reached.
// The caller owns the query's pending decisions. This function retains no queue, source or result.
export function planSearchReads(files, {visible = [], arrived = [], limit = 16} = {}) {
	if (!integer(limit) || !Array.isArray(files) || !Array.isArray(visible) || !Array.isArray(arrived)) throw new TypeError('invalid search read plan');
	const pending = new Map();
	for (const file of files) {
		const wanted = libraryReadRow(file);
		if (pending.has(wanted.key)) throw new TypeError('search reads repeat a file');
		pending.set(wanted.key, {...wanted, priority: file.priority === true});
	}
	const ordered = [...visible, ...[...pending.values()].filter(file => file.priority).map(file => file.key), ...arrived];
	const seen = new Set(), plan = [];
	for (const key of ordered) {
		if (plan.length === limit) break;
		if (seen.has(key)) continue; seen.add(key);
		const wanted = pending.get(key);
		if (wanted) plan.push(libraryReadRow(wanted));
	}
	return plan;
}
