import {admitPreset} from '../presets/record.mjs';
export {admitPreset};
const hash = /^[a-f0-9]{64}$/, writer = /^[a-f0-9]{32}$/;
const keyShape = /^(?:preference\/[A-Za-z][A-Za-z0-9]*|drawing\/[A-Za-z][A-Za-z0-9]*|font\/f[a-f0-9]{24}|preset\/p[a-f0-9]{24}|brush\/own\/[A-Za-z0-9._-]+|plugin\/[a-z][a-z0-9-]{0,31})$/;
const DEVICE_KEYS = new Set(['preference/readOnly', 'preference/fontSize']);
export const personalTravels = key => !DEVICE_KEYS.has(key);
const assetKey = key => key.startsWith('font/') || key.startsWith('brush/') || key.startsWith('preset/');
const encode = value => new TextEncoder().encode(JSON.stringify(value));
const fail = message => { throw Object.assign(new Error(message), {code: 'personal_invalid'}); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function personalDigest(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join(''); }
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
export function createPersonalOwner({storage, apply = () => {}, validateAsset = () => {}, now = Date.now}) {
	let state = null, tail = Promise.resolve();
	const fresh = () => ({writer: crypto.randomUUID().replaceAll('-', ''), records: {}, blobs: {}});
	const check = value => {
		value ??= fresh();
		if (!writer.test(value.writer)) fail('Personal settings have no local writer.');
		if (!value.records || !value.blobs || typeof value.blobs !== 'object' || Array.isArray(value.blobs)) fail('Personal settings have no complete local record.');
		value.records = admitPersonal(value.records, {local: true});
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
		set(key, value, assertActive = () => {}) { return schedule(async () => {
			if (!personalTravels(key)) return;
			state = check(await storage.update(raw => { const next = check(raw); assertActive(next); if (same(next.records[key]?.value, value)) return next; next.records[key] = {by: next.writer, n: tick(clock(next)), value}; next.records = admitPersonal(next.records, {local: true}); return next; }));
		}); },
		putAsset(key, value, assertActive = () => {}) { value = structuredClone(value); return schedule(async () => {
			validateAsset(key, value); const content = await personalDigest(encode(value));
			state = check(await storage.update(raw => { const next = check(raw); assertActive(next); next.blobs[content] = value; if (next.records[key]?.value?.content !== content) next.records[key] = {by: next.writer, n: tick(clock(next)), value: {content, object: null}}; next.records = admitPersonal(next.records, {local: true}); return next; }));
		}); },
		snapshot() { return schedule(async () => { await read(); return {records: structuredClone(state.records), blobs: {...state.blobs}}; }); }
	});
}
