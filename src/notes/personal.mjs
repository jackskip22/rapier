// Portable choices share the Notes vault. Each field has a logical revision, independent of
// wall clocks; concurrent choices converge by writer identity. Assets merge by their own IDs.
const hash = /^[a-f0-9]{64}$/, writer = /^[a-f0-9]{32}$/;
const keyShape = /^(?:preference\/[A-Za-z][A-Za-z0-9]*|drawing\/[A-Za-z][A-Za-z0-9]*|font\/f[a-f0-9]{24}|brush\/own\/[A-Za-z0-9._-]+)$/;
const assetKey = key => key.startsWith('font/') || key.startsWith('brush/');
const encode = value => new TextEncoder().encode(JSON.stringify(value));
const fail = message => { throw Object.assign(new Error(message), {code: 'personal_invalid'}); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export async function personalDigest(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join(''); }
export function admitPersonal(input = {}, {local = false} = {}) {
	if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 1024) fail('Personal settings are not a readable collection.');
	const out = {};
	for (const key of Object.keys(input).sort()) {
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
// storage.update is a single local read/write transaction. A network result is rebased against
// its capture, so choices made while the download was running stay the person's newest choices.
export function createPersonalOwner({storage, apply = () => {}, validateAsset = () => {}}) {
	let state = null, tail = Promise.resolve();
	const fresh = () => ({writer: crypto.randomUUID().replaceAll('-', ''), records: {}, blobs: {}});
	const check = value => {
		value ||= fresh();
		if (!writer.test(value.writer)) fail('Personal settings have no local writer.');
		value.records = admitPersonal(value.records, {local: true}); value.blobs ||= {};
		return value;
	};
	const schedule = work => { const job = tail.then(work); tail = job.catch(() => {}); return job; };
	const ready = schedule(async () => { state = check(await storage.update(value => check(value))); await apply(state); });
	function clock(value) { return Math.max(0, ...Object.values(value.records).map(row => row.n)); }
	return Object.freeze({
		ready,
		values(prefix) { return Object.fromEntries(Object.entries(state?.records || {}).filter(([key, row]) => key.startsWith(prefix) && row.value !== null).map(([key, row]) => [key.slice(prefix.length), assetKey(key) ? state.blobs[row.value.content] : row.value])); },
		set(key, value) { return schedule(async () => {
			state = check(await storage.update(raw => { const next = check(raw); if (same(next.records[key]?.value, value)) return next; next.records[key] = {by: next.writer, n: clock(next) + 1, value}; next.records = admitPersonal(next.records, {local: true}); return next; }));
		}); },
		putAsset(key, value) { return schedule(async () => {
			validateAsset(key, value); const content = await personalDigest(encode(value));
			state = check(await storage.update(raw => { const next = check(raw); next.blobs[content] = value; if (next.records[key]?.value?.content !== content) next.records[key] = {by: next.writer, n: clock(next) + 1, value: {content, object: null}}; next.records = admitPersonal(next.records, {local: true}); return next; }));
		}); },
		snapshot() { return schedule(async () => { state = check(await (storage.read ? storage.read() : storage.update(raw => check(raw)))); return {records: structuredClone(state.records), blobs: {...state.blobs}}; }); },
		commit(incoming, baseline, assertActive = () => {}) { return schedule(async () => {
			const records = admitPersonal(incoming.records), blobs = {...incoming.blobs};
			for (const [key, row] of Object.entries(records)) if (assetKey(key) && row.value) {
				const value = blobs[row.value.content];
				if (!value || await personalDigest(encode(value)) !== row.value.content) fail('A personal asset is incomplete.');
				validateAsset(key, value);
			}
			state = check(await storage.update(raw => {
				assertActive(); const current = check(raw), merged = mergePersonal(current.records, records);
				let n = Math.max(clock(current), ...Object.values(merged).map(row => row.n));
				for (const [key, row] of Object.entries(current.records)) if (!same(row, baseline?.records?.[key]) && !same(row.value, merged[key]?.value)) merged[key] = {...row, by: current.writer, n: ++n};
				// The same font can live in several vaults. Its current encrypted address is a
				// transport fact, not a newer choice; take the verified address just synchronized.
				for (const [key, row] of Object.entries(records)) if (assetKey(key) && row.value && merged[key]?.value?.content === row.value.content) merged[key].value = {...merged[key].value, object: row.value.object};
				return {...current, records: merged, blobs: {...current.blobs, ...blobs}};
			}));
			assertActive(); await apply(state);
		}); }
	});
}
