// SPDX-License-Identifier: AGPL-3.0-only
// Only the built-in editor resource includes this host. The ordinary loader owns verification,
// execution and status; the resource supplies immutable bytes instead of a device download.
const RapierBundledPlugins = (() => {
	const manifest = document.getElementById('rapier-builtin-plugins');
	if (!manifest) throw new Error('The editor plug-in inventory is missing');
	const groups = JSON.parse(manifest.textContent);
	const known = new Set(groups.flatMap(group => group.files.map(file => file.id)));
	const loading = Promise.all(groups.map(async group => {
		if (document.readyState !== 'loading' && !document.getElementById(group.element))
			throw new Error('The editor plug-in group is missing: ' + group.id);
		await _rapierWhenRuntime(group.element);
		const spans = await _rapierInflateVendor(group.element);
		if (spans.length !== group.files.length) throw new Error('The editor plug-in group is incomplete: ' + group.id);
		return group.files.map((file, index) => {
			if (spans[index].name !== file.name || spans[index].bytes.byteLength !== file.bytes)
				throw new Error('The editor plug-in file is incomplete: ' + file.id);
			return [file.id, spans[index].bytes];
		});
	})).then(groups => new Map(groups.flat()));
	// A failure is retained for the boot barrier and resource reads, even before either starts waiting.
	loading.catch(() => {});
	const read = async id => {
		if (!known.has(id)) return null;
		const bytes = (await loading).get(id);
		return bytes.slice();
	};
	const resources = Object.freeze({
		status: async id => known.has(id) ? ((await loading), {status: 'ready'}) : {status: 'unavailable'},
		read,
		ensure: async id => {
			const bytes = await read(id);
			if (!bytes) throw new Error('The editor does not carry this plug-in: ' + id);
			return bytes;
		},
	});
	_rapierPlatformPortRuntime.port = {...window.RapierPlatform, resources};
	function installed(key) {
		const provider = _rapierProviders[key];
		if (!provider) return Promise.reject(new Error('The editor plug-in has no loader: ' + key));
		return new Promise((resolve, reject) => {
			function check() {
				if (provider.status === 'ready') resolve();
				else if (provider.status === 'error' || provider.status === 'absent')
					reject(new Error('The editor plug-in could not start: ' + key));
			}
			provider.on(check); check();
		});
	}
	return Object.freeze({
		has: id => known.has(id),
		async ready() {
			await loading;
			await Promise.all(groups.filter(group => group.id !== 'letters').map(group => installed(group.id)));
			const letters = groups.find(group => group.id === 'letters');
			const store = RapierBundleIO.store(RapierStorage.optional.lettersDb, 'bundle');
			const admitted = await Promise.all(letters.files.map(async file => {
				const entry = globalThis.RapierDrawLetters.LETTER_SETS.find(set => 'rapier-letters-' + set.id === file.id);
				if (!entry) throw new Error('The editor letter set is unknown: ' + file.id);
				const provider = RapierPluginLoader.files({key: 'letters-' + entry.id, noun: entry.name + ' letter set', dash: ' — ',
					version: entry.id + ' ' + entry.sha384,
					files: [{name: entry.id, bytes: entry.bytes, sri: entry.sha384}], store});
				await installed('letters-' + entry.id);
				const bytes = (await provider.bytes())[entry.id];
				const set = globalThis.RapierDrawLetters.admitLetterSet(bytes);
				if (!set || 'rapier-letters-' + set.id !== file.id) throw new Error('The editor letter set is invalid: ' + file.id);
				return set;
			}));
			for (const set of admitted) if (!globalThis.RapierDrawLetters.holdLetterSet(set))
				throw new Error('The editor letter set could not be held: ' + set.id);
		},
	});
})();
