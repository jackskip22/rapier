const _rapierPersonalStore = globalThis.__rapierServerRenderHost === true ? null : (() => {
	let dbPromise, transientProfile = null;
	const transient = globalThis.RapierBenchSession?.active === true || globalThis.RapierPlatform?.host?.lockedNotes === true;
	function database() {
		if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open('rapier:personal' + RapierStorage.scope, 1);
			request.onupgradeneeded = () => request.result.createObjectStore('personal');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return dbPromise;
	}
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
			if (transient) return transientProfile;
			const db = await database();
			return new Promise((resolve, reject) => {
				const tx = db.transaction('personal', 'readonly'), store = tx.objectStore('personal'), read = store.get('profile');
				read.onsuccess = () => hydrate(store, read.result, resolve, error => { reject(error); tx.abort(); });
				tx.onerror = tx.onabort = () => reject(tx.error || new Error('Couldn’t read your settings.'));
			});
		},
		async update(change) {
			if (transient) return transientProfile = change(transientProfile);
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
				tx.onerror = tx.onabort = () => reject(error || tx.error || new Error('Couldn’t save your settings.'));
			});
		}
	};
	const dataOnly = (value, depth = 0) => {
		if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
		if (typeof value === 'number') return Number.isFinite(value);
		if (depth > 12 || typeof value !== 'object' || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
		return Object.values(value).every(next => dataOnly(next, depth + 1));
	};
	function validateAsset(key, value) {
		if (key.startsWith('font/')) {
			const font = globalThis.RapierDrawFonts.admitFonts([value])[0];
			if ('font/' + font.id !== key) throw new Error('The font identity changed.');
		} else if (key.startsWith('preset/')) {
			const preset = globalThis.RapierPersonal.admitPreset(value);
			if ('preset/' + preset.id !== key) throw new Error('The starter identity changed.');
		} else {
			if (!value || typeof value.id !== 'string' || 'brush/' + value.id !== key || typeof value.name !== 'string' || value.name.length > 64 || typeof value.notes !== 'string' || value.notes.length > 160 || !dataOnly(value) || JSON.stringify(value).length > 1048576) throw new Error('The brush is not a readable preset.');
		}
	}
	const listeners = new Set();
	let applied = null;
	const owner = globalThis.RapierPersonal.createPersonalOwner({storage, validateAsset, apply: async profile => {
		applied = profile;
		for (const listener of listeners) await listener(profile);
	}});
	return Object.freeze({...owner, validateAsset, subscribe(listener) {
		listeners.add(listener);
		if (applied) Promise.resolve(listener(applied)).catch(error => showToast(_rapierErrorWords(error, 'Couldn’t apply your settings.'), 'error'));
		return () => listeners.delete(listener);
	}});
})();
