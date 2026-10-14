const _rapierPersonal = globalThis.__rapierServerRenderHost === true ? null : (() => {
	let applying = false, pendingBrushes = 0;
	const pendingPreferences = new Map(), pendingDrawing = new Map();
	const transient = globalThis.RapierBenchSession?.active === true;
	const drawing = () => typeof _rapierDrawState !== 'undefined';
	const drawKeys = () => ({...drawing() ? {...Object.fromEntries(Object.entries(RAPIER_DRAW_MEMORY).map(([key, value]) => [key, value[0]])),
		recentInks: RAPIER_DRAW_RECENT_KEY, paintBrush: RAPIER_PAINT_BRUSH_KEY, paintStrength: RAPIER_PAINT_STRENGTH_KEY, paintHead: RAPIER_PAINT_HEAD_KEY,
		paintSizes: RAPIER_PAINT_SIZES_KEY, paintDips: RAPIER_PAINT_DIP_KEY} : {}, exportDialect: 'rapier:export.pandocDialect'});
	async function apply(profile) {
		if (transient) return;
		applying = true;
		try {
			const keys = drawKeys(), brushes = [];
			for (const [key, row] of Object.entries(profile.records)) {
				const value = row.value;
				if (key.startsWith('preference/')) {
					const name = key.slice(11), spec = RapierStorage.preferences[name];
					if (!spec || pendingPreferences.has(name) || value == null || typeof value !== typeof spec.fallback || spec.values && !spec.values.includes(value) || spec.pattern && !new RegExp(spec.pattern).test(value)) continue;
					if (name === 'defaultDocumentFont' && value.startsWith('f')) {
						const key = 'font/' + value, asset = profile.records[key]?.value;
						try {
							if (!asset) throw new Error('The default document font is missing from your fonts.');
							_rapierPersonalStore.validateAsset(key, profile.blobs[asset.content]);
						} catch (error) { showToast(String(error.message || error), 'error'); continue; }
					}
					if (RapierPreferences.read(name) !== value) RapierPreferences.write(name, value);
				} else if (key.startsWith('drawing/') && drawing()) {
					const name = key.slice(8), storageKey = keys[name];
					if (pendingDrawing.has(name)) continue;
					if (storageKey && (typeof value === 'string' || value === null)) {
						if (value === null) localStorage.removeItem(storageKey); else localStorage.setItem(storageKey, value);
						if (name === 'textDefaults') _rapierDrawState.textDefaults = null;
					}
					else if (name === 'paintFits' && typeof value === 'string') {
						let fits; try { fits = JSON.parse(value); } catch (_) { continue; }
						if (!fits || typeof fits !== 'object' || Array.isArray(fits)) continue;
						for (const [id, on] of Object.entries(fits)) if (/^[A-Za-z0-9_./-]+$/.test(id) && typeof on === 'boolean') { if (on) localStorage.removeItem(RAPIER_PAINT_FIT_KEY + id); else localStorage.setItem(RAPIER_PAINT_FIT_KEY + id, 'off'); }
					}
				} else if (key.startsWith('brush/') && value && drawing()) { const brush = profile.blobs[value.content]; _rapierPersonalStore.validateAsset(key, brush); brushes.push(brush); }
			}
			if (!pendingBrushes && drawing() && Object.keys(profile.records).some(key => key.startsWith('brush/'))) {
				let local; try { local = _rapierPaintStoredBrushes(); } catch (_) {}
				if (local) {
					const kept = local.filter(row => typeof row?.id !== 'string' || !Object.hasOwn(profile.records, 'brush/' + row.id));
					localStorage.setItem(RAPIER_PAINT_OWN_KEY, JSON.stringify(kept.concat(brushes))); _rapierDrawState.paintOwn = null;
				}
			}
			if (drawing() && _rapierDrawState.open) {
				if (!_rapierDrawState.gesture) { _rapierDrawState.paintBrush = _rapierPaintRememberedBrush(); _rapierDrawState.paintSize = _rapierPaintRememberedSize(); _rapierDrawState.paintStrength = _rapierPaintRememberedStrength(); _rapierDrawState.paintHead = null; }
				_rapierDrawSyncTextPanels(); _rapierDrawUpdateMenu(); _rapierPaintUpdateStrip();
			}
			if (typeof _rapierNotes !== 'undefined' && _rapierNotes.open) { _rapierNotesLayout(); _rapierNotesRender(); _rapierNotesHeadPaint(); }
		} finally { applying = false; }
	}
	const owner = _rapierPersonalStore;
	owner.subscribe(async profile => { await apply(profile); plugins.scan(); plugins.fulfil(); });
	const travels = globalThis.RapierPersonal.personalTravels;
	const changed = () => { if (!transient && typeof _rapierNotesSyncUi !== 'undefined') _rapierNotesSyncUi.changed('settings'); };
	const report = error => showToast(String(error?.message || 'Personal settings could not be saved.'), 'error');
	const plugins = (() => {
		const KEYS = ['math', 'mermaid', 'ocr', 'letters-field', 'letters-relief', 'letters-leaf', 'letters-arabesque', 'pdf'], DECLINED = 'rapier:plugin:declined';
		const declined = () => { try { return new Set(JSON.parse(localStorage.getItem(DECLINED) || '[]')); } catch (_) { return new Set(); } };
		const mark = (key, on) => { try { const set = declined(); if (on) set.add(key); else set.delete(key); localStorage.setItem(DECLINED, JSON.stringify([...set])); } catch (_) {} };
		const provider = key => key === 'pdf' ? globalThis.RapierPdfPlugin : _rapierProviders[key];
		const here = key => { const p = provider(key); return !p ? 'none' : key === 'pdf' ? (p.state().installed ? 'ready' : p.state().downloading || p.state().error ? 'busy' : 'absent') : p.status; };
		const wished = key => owner.values('plugin/')[key] === true;
		function record(key) { if (transient) return; mark(key, false); if (!wished(key)) owner.set('plugin/' + key, true).then(changed).catch(report); }
		function fulfil() { if (transient) return; for (const key of KEYS) if (wished(key) && !declined().has(key) && here(key) === 'absent') Promise.resolve(provider(key).install()).catch(() => {}); }
		for (const key of KEYS) if (key !== 'pdf') addEventListener('rapier:' + key + 'plugin', event => { if (event.detail?.installed) record(key); else if (event.detail?.status === 'absent') fulfil(); });
		return {record, fulfil, decline: key => { if (!transient) mark(key, true); }, scan: () => { if (!transient) for (const key of KEYS) if (here(key) === 'ready') record(key); }};
	})();
	for (const field of Object.keys(RapierStorage.preferences)) if (travels('preference/' + field)) RapierPreferences.subscribe(field, value => {
		if (applying) return;
		const token = {}; pendingPreferences.set(field, token);
		owner.set('preference/' + field, value).then(changed).catch(report).finally(() => { if (pendingPreferences.get(field) === token) pendingPreferences.delete(field); });
	});
	const ready = owner.ready.then(async () => {
		if (transient) return;
		const {records} = await owner.snapshot();
		for (const field of Object.keys(RapierStorage.preferences)) if (travels('preference/' + field) && !records['preference/' + field] && RapierPreferences.chosen(field)) await owner.set('preference/' + field, RapierPreferences.read(field));
		await recordDrawing(records);
		plugins.scan();
	});
	async function recordDrawing(records) {
		for (const [field, key] of Object.entries(drawKeys())) { const value = localStorage.getItem(key); if (value !== null && !records['drawing/' + field]) await owner.set('drawing/' + field, value); }
		if (drawing()) for (const row of _rapierPaintOwnBrushes()) if (!records['brush/' + row.id]) await owner.putAsset('brush/' + row.id, {id: row.id, name: row.name, notes: row.notes, myb: row.myb});
	}
	addEventListener('rapier:part', event => {
		if (transient || event.detail?.id !== 'drawing' || event.detail.status !== 'ready') return;
		ready.then(async () => { const profile = await owner.snapshot(); await apply(profile); await recordDrawing(profile.records); }).catch(report);
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
				for (const row of rows) { const prior = before.find(old => old.id === row.id); if (!prior || JSON.stringify(body(prior)) !== JSON.stringify(body(row))) await owner.putAsset('brush/' + row.id, body(row)); }
				for (const row of before) if (!rows.some(next => next.id === row.id)) await owner.set('brush/' + row.id, null);
				changed();
			} finally { pendingBrushes--; }
		}
	});
})();
