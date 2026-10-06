// Portable choices share the Notes vault. Each field has a revision `n` on a hybrid logical clock:
// above every revision this shelf has seen, and never below the device's time, so a choice made
// after seeing another wins and, between concurrent choices, the later in the person's day wins.
// Equal revisions converge by writer identity. Assets merge by their own IDs.
import {DEFAULT_POLICY} from './history.mjs';
const hash = /^[a-f0-9]{64}$/, writer = /^[a-f0-9]{32}$/;
const keyShape = /^(?:preference\/[A-Za-z][A-Za-z0-9]*|drawing\/[A-Za-z][A-Za-z0-9]*|font\/f[a-f0-9]{24}|brush\/own\/[A-Za-z0-9._-]+|plugin\/[a-z][a-z0-9-]{0,31})$/;
// Choices that belong to the device: Read only is this editor's mode (the writer lease writes it),
// and text size multiplies the device's own scale. They never enter a shelf, local or received.
const DEVICE_KEYS = new Set(['preference/readOnly', 'preference/fontSize']);
export const personalTravels = key => !DEVICE_KEYS.has(key);
const assetKey = key => key.startsWith('font/') || key.startsWith('brush/');
const encode = value => new TextEncoder().encode(JSON.stringify(value));
const fail = message => { throw Object.assign(new Error(message), {code: 'personal_invalid'}); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DAY = 86400000;
export async function personalDigest(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join(''); }
export function admitPersonal(input = {}, {local = false} = {}) {
	if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 1024) fail('Personal settings are not a readable collection.');
	const out = {};
	for (const key of Object.keys(input).sort()) {
		if (DEVICE_KEYS.has(key)) continue;
		const row = input[key];
		if (!keyShape.test(key) || key.length > 180 || !row || Object.keys(row).sort().join() !== 'by,n,value' || !writer.test(row.by) || !Number.isSafeInteger(row.n) || row.n < 1) fail('A personal setting has an invalid revision.');
		if (assetKey(key) && row.value !== null) {
			const value = row.value;
			if (!value || Object.keys(value).sort().join() !== 'content,object' || !hash.test(value.content) || !(hash.test(value.object) || local && value.object === null)) fail('A personal asset has no verified address.');
		} else if (row.value !== null && !['string', 'boolean', 'number'].includes(typeof row.value) || typeof row.value === 'number' && !Number.isFinite(row.value) || typeof row.value === 'string' && row.value.length > 65536) fail('A personal setting has an invalid value.');
		out[key] = structuredClone(row);
	}
	return out;
}
export function mergePersonal(...sources) {
	const out = {};
	for (const source of sources) for (const [key, row] of Object.entries(admitPersonal(source || {}, {local: true}))) {
		const old = out[key];
		if (!old || row.n > old.n || row.n === old.n && row.by > old.by) out[key] = row;
		else if (row.n === old.n && row.by === old.by) {
			if (assetKey(key) && row.value?.content === old.value?.content && row.value?.object && (!old.value?.object || row.value.object < old.value.object)) out[key] = row;
			else if (!same(row.value, old.value) && !(assetKey(key) && row.value?.content === old.value?.content)) fail('A personal setting revision has conflicting values.');
		}
	}
	return admitPersonal(out, {local: true});
}
export function personalAsset(key) { return assetKey(key); }
// A choice this shelf wrote that a received one replaced is kept in the shelf's own ledger, never
// in a head, on the note history's policy: everything for a week, then the newest per key per day.
const choiceOf = (key, value) => assetKey(key) && value ? value.content : value;
function admitLedger(rows) {
	if (!Array.isArray(rows)) fail('The kept earlier choices are not readable.');
	for (const row of rows) if (!row || typeof row !== 'object' || !keyShape.test(row.key) || !writer.test(row.by) || !Number.isSafeInteger(row.n) || row.n < 1 ||
		!Number.isSafeInteger(row.at) || row.at < 0 || !row.over || !writer.test(row.over.by) || !Number.isSafeInteger(row.over.n) ||
		(assetKey(row.key) ? row.value !== null && !(row.value && hash.test(row.value.content)) : row.value !== null && !['string', 'boolean', 'number'].includes(typeof row.value)))
		fail('A kept earlier choice is not readable.');
	return rows.filter(row => !DEVICE_KEYS.has(row.key));
}
function keepLedger(rows, at) {
	const kept = [], days = new Set();
	for (const row of rows.slice().sort((a, b) => b.at - a.at)) {
		const day = row.key + '\n' + Math.floor(row.at / DAY);
		if (at - row.at < DEFAULT_POLICY.allDays * DAY || !days.has(day)) kept.push(row);
		days.add(day);
	}
	return kept.reverse();
}
// storage.update is a single local read/write transaction. A network result is rebased against
// its capture, so choices made while the download was running stay the person's newest choices.
export function createPersonalOwner({storage, apply = () => {}, validateAsset = () => {}, now = Date.now}) {
	let state = null, tail = Promise.resolve();
	const fresh = () => ({writer: crypto.randomUUID().replaceAll('-', ''), records: {}, blobs: {}, ledger: []});
	const check = value => {
		value ??= fresh();
		if (!writer.test(value.writer)) fail('Personal settings have no local writer.');
		if (!value.records || !value.blobs || typeof value.blobs !== 'object' || Array.isArray(value.blobs) || !Array.isArray(value.ledger)) fail('Personal settings have no complete local record.');
		value.records = admitPersonal(value.records, {local: true}); value.ledger = admitLedger(value.ledger);
		return value;
	};
	const schedule = work => { const job = tail.then(work); tail = job.catch(() => {}); return job; };
	const ready = schedule(async () => { state = check(await storage.update(value => check(value))); await apply(state); });
	const read = async () => { state = check(await (storage.read ? storage.read() : storage.update(raw => check(raw)))); return state; };
	function clock(value) { return Math.max(0, ...Object.values(value.records).map(row => row.n)); }
	const tick = seen => Math.max(seen + 1, Math.floor(now()));
	return Object.freeze({
		ready,
		values(prefix) { return Object.fromEntries(Object.entries(state?.records || {}).filter(([key, row]) => key.startsWith(prefix) && row.value !== null).map(([key, row]) => [key.slice(prefix.length), assetKey(key) ? state.blobs[row.value.content] : row.value])); },
		set(key, value) { return schedule(async () => {
			if (!personalTravels(key)) return;
			state = check(await storage.update(raw => { const next = check(raw); if (same(next.records[key]?.value, value)) return next; next.records[key] = {by: next.writer, n: tick(clock(next)), value}; next.records = admitPersonal(next.records, {local: true}); return next; }));
		}); },
		putAsset(key, value) { return schedule(async () => {
			validateAsset(key, value); const content = await personalDigest(encode(value));
			state = check(await storage.update(raw => { const next = check(raw); next.blobs[content] = value; if (next.records[key]?.value?.content !== content) next.records[key] = {by: next.writer, n: tick(clock(next)), value: {content, object: null}}; next.records = admitPersonal(next.records, {local: true}); return next; }));
		}); },
		snapshot() { return schedule(async () => { await read(); return {records: structuredClone(state.records), blobs: {...state.blobs}}; }); },
		// The shelf's writer, the provenance its records carry (`by`): a head names it beside the device's label.
		writer() { return schedule(async () => (await read()).writer); },
		ledger() { return schedule(async () => structuredClone((await read()).ledger)); },
		// An earlier choice comes back as the newest choice here, and so everywhere after a sync.
		restore(entry) { return schedule(async () => {
			state = check(await storage.update(raw => {
				const next = check(raw), at = next.ledger.findIndex(row => same(row, entry));
				if (at < 0) fail('That earlier choice is no longer kept here.');
				const row = next.ledger[at];
				if (assetKey(row.key) && row.value && !next.blobs[row.value.content]) fail('That earlier choice has no kept body.');
				next.records[row.key] = {by: next.writer, n: tick(clock(next)), value: assetKey(row.key) && row.value ? {content: row.value.content, object: row.value.object ?? null} : row.value};
				next.records = admitPersonal(next.records, {local: true}); next.ledger.splice(at, 1);
				return next;
			}));
			await apply(state);
		}); },
		commit(incoming, baseline, assertActive = () => {}) { return schedule(async () => {
			const records = admitPersonal(incoming.records), blobs = {...incoming.blobs};
			for (const [key, row] of Object.entries(records)) if (assetKey(key) && row.value) {
				const value = blobs[row.value.content];
				if (!value || await personalDigest(encode(value)) !== row.value.content) fail('A personal asset is incomplete.');
				validateAsset(key, value);
			}
			state = check(await storage.update(raw => {
				assertActive(); const current = check(raw), merged = mergePersonal(current.records, records), at = Math.floor(now());
				let n = Math.max(clock(current), ...Object.values(merged).map(row => row.n));
				for (const [key, row] of Object.entries(current.records)) if (!same(row, baseline?.records?.[key]) && !same(row.value, merged[key]?.value)) merged[key] = {...row, by: current.writer, n: n = Math.max(n + 1, at)};
				// The same font can live in several vaults. Its current encrypted address is a
				// transport fact, not a newer choice; take the verified address just synchronized.
				for (const [key, row] of Object.entries(records)) if (assetKey(key) && row.value && merged[key]?.value?.content === row.value.content) merged[key].value = {...merged[key].value, object: row.value.object};
				// Nothing chosen here is gone: what a received choice replaced goes to the ledger.
				const replaced = Object.entries(current.records).filter(([key, row]) => row.by === current.writer && merged[key] && !same(choiceOf(key, row.value), choiceOf(key, merged[key].value)))
					.map(([key, row]) => ({key, value: row.value, n: row.n, by: row.by, at, over: {by: merged[key].by, n: merged[key].n}}));
				return {...current, records: merged, blobs: {...current.blobs, ...blobs}, ledger: keepLedger([...current.ledger, ...replaced], at)};
			}));
			assertActive(); await apply(state);
		}); }
	});
}
