// The personal shelf owns portable customisations; credentials and device permissions never enter it.
const _rapierPersonal = (() => {
	let dbPromise, applying = false, pendingBrushes = 0;
	const pendingPreferences = new Map(), pendingDrawing = new Map();
	function database() {
		if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open('rapier:personal' + RapierStorage.scope, 1);
			request.onupgradeneeded = () => request.result.createObjectStore('personal');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return dbPromise;
	}
	// Immutable font/brush bodies are separate records: a slider change writes only the small
	// manifest. One read/write transaction serializes changes made in different open tabs.
	const bodies = new Map();
	function hydrate(store, metadata, done, refuse) {
		if (!metadata) { done(null); return; }
		if (!Array.isArray(metadata.blobKeys)) { refuse(Object.assign(new Error('Personal settings have no saved asset list.'), {code: 'personal_invalid'})); return; }
		const blobs = {}, missing = metadata.blobKeys.filter(key => !bodies.has(key));
		let left = missing.length;
		const finish = () => { for (const key of metadata.blobKeys) blobs[key] = bodies.get(key); const {blobKeys, ...rest} = metadata; done({...rest, blobs}); };
		if (!left) { finish(); return; }
		for (const key of missing) { const get = store.get('asset/' + key); get.onsuccess = () => { bodies.set(key, get.result); if (!--left) finish(); }; }
	}
	const storage = {
		async read() {
			const db = await database();
			return new Promise((resolve, reject) => {
				const tx = db.transaction('personal', 'readonly'), store = tx.objectStore('personal'), read = store.get('profile');
				read.onsuccess = () => hydrate(store, read.result, resolve, error => { reject(error); tx.abort(); });
				tx.onerror = tx.onabort = () => reject(tx.error || new Error('Personal settings could not be read.'));
			});
		},
		async update(change) {
			const db = await database();
			return new Promise((resolve, reject) => {
				const tx = db.transaction('personal', 'readwrite'), store = tx.objectStore('personal'), read = store.get('profile');
				let next, error;
				const refuse = caught => { error = caught; tx.abort(); };
				read.onsuccess = () => hydrate(store, read.result, current => {
					try {
						next = change(current);
						const known = new Set(read.result?.blobKeys || []), {blobs, ...metadata} = next;
						for (const [key, body] of Object.entries(blobs)) if (!known.has(key)) store.put(body, 'asset/' + key);
						store.put({...metadata, blobKeys: Object.keys(blobs)}, 'profile');
					} catch (caught) { refuse(caught); }
				}, refuse);
				tx.oncomplete = () => { for (const [key, body] of Object.entries(next.blobs)) bodies.set(key, body); resolve(next); };
				tx.onerror = tx.onabort = () => reject(error || tx.error || new Error('Personal settings could not be saved.'));
			});
		}
	};
	const drawKeys = () => ({...Object.fromEntries(Object.entries(RAPIER_DRAW_MEMORY).map(([key, value]) => [key, value[0]])),
		recentInks: RAPIER_DRAW_RECENT_KEY, paintBrush: RAPIER_PAINT_BRUSH_KEY, paintStrength: RAPIER_PAINT_STRENGTH_KEY,
		paintSizes: RAPIER_PAINT_SIZES_KEY, paintDips: RAPIER_PAINT_DIP_KEY, exportDialect: 'rapier:export.pandocDialect'});
	function validateAsset(key, value) {
		if (key.startsWith('font/')) {
			const font = globalThis.RapierDrawFonts.admitFonts([value])[0];
			if ('font/' + font.id !== key) throw new Error('The font identity changed.');
		} else {
			if (!value || 'brush/' + value.id !== key || typeof value.name !== 'string' || value.name.length > 64 || typeof value.notes !== 'string' || value.notes.length > 160 || JSON.stringify(value).length > 1048576) throw new Error('The brush is not a readable preset.');
			globalThis.RapierDrawPaint.parseBrush(value.myb);
		}
	}
	async function apply(profile) {
		applying = true;
		try {
			const keys = drawKeys(), brushes = [];
			for (const [key, row] of Object.entries(profile.records)) {
				const value = row.value;
				if (key.startsWith('preference/')) {
					const name = key.slice(11), spec = RapierStorage.preferences[name];
					if (!spec || pendingPreferences.has(name) || value == null || typeof value !== typeof spec.fallback || spec.values && !spec.values.includes(value)) continue;
					if (RapierPreferences.read(name) !== value) RapierPreferences.write(name, value);
				} else if (key.startsWith('drawing/')) {
					const name = key.slice(8), storageKey = keys[name];
					if (pendingDrawing.has(name)) continue;
					if (storageKey && (typeof value === 'string' || value === null)) { if (value === null) localStorage.removeItem(storageKey); else localStorage.setItem(storageKey, value); }
					else if (name === 'paintFits' && typeof value === 'string') {
						let fits; try { fits = JSON.parse(value); } catch (_) { continue; }
						if (!fits || typeof fits !== 'object' || Array.isArray(fits)) continue;
						for (const [id, on] of Object.entries(fits)) if (/^[A-Za-z0-9_./-]+$/.test(id) && typeof on === 'boolean') { if (on) localStorage.removeItem(RAPIER_PAINT_FIT_KEY + id); else localStorage.setItem(RAPIER_PAINT_FIT_KEY + id, 'off'); }
					}
				} else if (key.startsWith('brush/') && value) { const brush = profile.blobs[value.content]; validateAsset(key, brush); brushes.push(brush); }
			}
			if (!pendingBrushes && Object.keys(profile.records).some(key => key.startsWith('brush/'))) {
				localStorage.setItem(RAPIER_PAINT_OWN_KEY, JSON.stringify(brushes)); _rapierDrawState.paintOwn = null;
			}
			if (_rapierDrawState.open) {
				if (!_rapierDrawState.gesture) { _rapierDrawState.paintBrush = _rapierPaintRememberedBrush(); _rapierDrawState.paintSize = _rapierPaintRememberedSize(); _rapierDrawState.paintStrength = _rapierPaintRememberedStrength(); }
				_rapierDrawSyncTextPanels(); _rapierDrawUpdateMenu(); _rapierPaintUpdateStrip();
			}
			if (typeof _rapierNotes !== 'undefined' && _rapierNotes.open) { _rapierNotesLayout(); _rapierNotesRender(); _rapierNotesHeadPaint(); }
		} finally { applying = false; }
	}
	const owner = globalThis.RapierPersonal.createPersonalOwner({storage, apply: async profile => { await apply(profile); plugins.scan(); plugins.fulfil(); }, validateAsset});
	const travels = globalThis.RapierPersonal.personalTravels;
	// A settings change syncs after a longer quiet than a saved edit, so a run of tries publishes once.
	const changed = () => { if (typeof _rapierNotesSyncUi !== 'undefined') _rapierNotesSyncUi.changed('settings'); };
	const report = error => showToast(String(error?.message || 'Personal settings could not be saved.'), 'error');
	// A plug-in installed here travels as a wish, never its bytes: each device fetches its own verified copy.
	// A delete is this device's alone: it declines the plug-in here and leaves the wish where it was.
	const plugins = (() => {
		const KEYS = ['math', 'mermaid', 'ocr', 'letters-field', 'letters-relief', 'letters-leaf', 'letters-arabesque', 'pdf'], DECLINED = 'rapier:plugin:declined';
		const declined = () => { try { return new Set(JSON.parse(localStorage.getItem(DECLINED) || '[]')); } catch (_) { return new Set(); } };
		const mark = (key, on) => { try { const set = declined(); if (on) set.add(key); else set.delete(key); localStorage.setItem(DECLINED, JSON.stringify([...set])); } catch (_) {} };
		const provider = key => key === 'pdf' ? globalThis.RapierPdfPlugin : _rapierProviders[key];
		const here = key => { const p = provider(key); return !p ? 'none' : key === 'pdf' ? (p.state().installed ? 'ready' : p.state().downloading || p.state().error ? 'busy' : 'absent') : p.status; };
		const wished = key => owner.values('plugin/')[key] === true;
		function record(key) { mark(key, false); if (!wished(key)) owner.set('plugin/' + key, true).then(changed).catch(report); }
		function fulfil() { for (const key of KEYS) if (wished(key) && !declined().has(key) && here(key) === 'absent') Promise.resolve(provider(key).install()).catch(() => {}); }
		for (const key of KEYS) if (key !== 'pdf') addEventListener('rapier:' + key + 'plugin', event => { if (event.detail?.installed) record(key); else if (event.detail?.status === 'absent') fulfil(); });
		return {record, fulfil, decline: key => mark(key, true), scan: () => { for (const key of KEYS) if (here(key) === 'ready') record(key); }};
	})();
	for (const field of Object.keys(RapierStorage.preferences)) if (travels('preference/' + field)) RapierPreferences.subscribe(field, value => {
		if (applying) return;
		const token = {}; pendingPreferences.set(field, token);
		owner.set('preference/' + field, value).then(changed).catch(report).finally(() => { if (pendingPreferences.get(field) === token) pendingPreferences.delete(field); });
	});
	const ready = owner.ready.then(async () => {
		const {records} = await owner.snapshot();
		for (const [field, spec] of Object.entries(RapierStorage.preferences)) if (travels('preference/' + field) && !records['preference/' + field] && (localStorage.getItem(spec.key) != null || RapierPreferences.read(field) !== spec.fallback)) await owner.set('preference/' + field, RapierPreferences.read(field));
		for (const [field, key] of Object.entries(drawKeys())) { const value = localStorage.getItem(key); if (value !== null && !records['drawing/' + field]) await owner.set('drawing/' + field, value); }
		for (const row of _rapierPaintOwnBrushes()) if (!records['brush/' + row.id]) await owner.putAsset('brush/' + row.id, {id: row.id, name: row.name, notes: row.notes, myb: row.myb});
		plugins.scan();
	});
	ready.catch(report);
	return Object.freeze({...owner, ready,
		declinePlugin: plugins.decline,
		async restore(entry) { await ready; await owner.restore(entry); changed(); },
		async snapshot() { await ready; return owner.snapshot(); },
		fonts() { return Object.values(owner.values('font/')).filter(Boolean); },
		async addFont(font) { await ready; await owner.putAsset('font/' + font.id, font); changed(); },
		rememberDrawing(key, value) {
			if (applying) return;
			const token = {}; pendingDrawing.set(key, token);
			void owner.set('drawing/' + key, value).then(changed).catch(report).finally(() => { if (pendingDrawing.get(key) === token) pendingDrawing.delete(key); });
		},
		async brushes(rows, before) {
			pendingBrushes++;
			try {
				await ready;
				const body = row => ({id: row.id, name: row.name, notes: row.notes, myb: row.myb});
				// Publish only changes made against the shelf the person saw. An unseen incoming
				// brush is neither a deletion nor a stale preset to overwrite with this whole list.
				for (const row of rows) { const prior = before.find(old => old.id === row.id); if (!prior || JSON.stringify(body(prior)) !== JSON.stringify(body(row))) await owner.putAsset('brush/' + row.id, body(row)); }
				for (const row of before) if (!rows.some(next => next.id === row.id)) await owner.set('brush/' + row.id, null);
				changed();
			} finally { pendingBrushes--; }
		}
	});
})();
