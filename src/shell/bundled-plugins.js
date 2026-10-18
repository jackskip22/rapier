// SPDX-License-Identifier: AGPL-3.0-only
const RapierBundledPlugins = (() => {
	const manifest = document.getElementById('rapier-builtin-plugins');
	if (!manifest) return Object.freeze({has: () => false, ready: async () => {}, need: async () => {}});
	const groups = JSON.parse(manifest.textContent);
	const known = new Map(groups.flatMap(group => group.files.map(file => [file.id, group])));
	const loads = new Map(), needs = new Map(), held = new Map();
	function load(group) {
		if (loads.has(group.id)) return loads.get(group.id);
		const loading = (async () => {
			let text;
			if (group.asset) {
				const {file, bytes, sri} = group.asset, url = RapierBundleIO.hostedUrl(file);
				if (!url) throw new Error('The editor plug-in directory is missing');
				const packed = await RapierBundleIO.verifySha384(await RapierBundleIO.fetchBytes(url, 60000, {length: bytes, cache: 'no-store'}), sri,
					{byteLength: bytes, source: RapierBundleIO.shortUrl(url)});
				text = new TextDecoder('utf-8', {fatal: true}).decode(packed);
			} else {
				if (document.readyState !== 'loading' && !document.getElementById(group.element))
					throw new Error('The editor plug-in group is missing: ' + group.id);
				await _rapierWhenRuntime(group.element);
				text = document.getElementById(group.element).textContent;
			}
			const spans = await _rapierInflateVendor(group.element, text);
			if (spans.length !== group.files.length) throw new Error('The editor plug-in group is incomplete: ' + group.id);
			const files = group.files.map((file, index) => {
				if (spans[index].name !== file.name || spans[index].bytes.byteLength !== file.bytes)
					throw new Error('The editor plug-in file is incomplete: ' + file.id);
				return [file.id, spans[index].bytes];
			});
			for (const [id, bytes] of files) held.set(id, bytes);
			return text;
		})();
		loads.set(group.id, loading);
		loading.catch(() => { if (loads.get(group.id) === loading) loads.delete(group.id); });
		return loading;
	}
	const carried = Promise.all(groups.filter(group => !group.asset).map(load));
	carried.catch(() => {});
	const read = async id => {
		if (!known.has(id)) return null;
		if (!known.get(id).asset) await load(known.get(id));
		return held.get(id)?.slice() || null;
	};
	const resources = Object.freeze({
		status: async id => {
			if (!known.has(id)) return {status: 'unavailable'};
			if (!known.get(id).asset) await load(known.get(id));
			return {status: held.has(id) ? 'ready' : 'absent'};
		},
		read,
		ensure: async id => {
			if (!known.has(id)) throw new Error('The editor does not carry this plug-in: ' + id);
			await load(known.get(id));
			return read(id);
		},
	});
	_rapierPlatformPortRuntime.port = {...window.RapierPlatform, resources};
	function installed(key) {
		const provider = _rapierProviders[key];
		if (!provider) return Promise.reject(new Error('The editor plug-in has no loader: ' + key));
		return new Promise((resolve, reject) => {
			function check() {
				if (!['ready', 'error', 'absent'].includes(provider.status)) return;
				removeEventListener('rapier:' + key + 'plugin', check);
				if (provider.status === 'ready') resolve();
				else if (provider.status === 'error' || provider.status === 'absent')
					reject(new Error('The editor plug-in could not start: ' + key));
			}
			addEventListener('rapier:' + key + 'plugin', check); check();
		});
	}
	function need(id) {
		if (needs.has(id)) return needs.get(id);
		const group = groups.find(group => group.id === id);
		if (!group) return Promise.resolve();
		const needed = (async () => {
			await load(group);
			if (id !== 'letters') return;
			const settled = await Promise.allSettled(group.files.map(async file => {
				const entry = globalThis.RapierDrawLetters.LETTER_SETS.find(set => 'rapier-letters-' + set.id === file.id);
				if (!entry) throw new Error('The editor letter set is unknown: ' + file.id);
				const provider = RapierPluginLoader.files({key: 'letters-' + entry.id, noun: entry.name + ' letter set', dash: ' — ',
					version: entry.id + ' ' + entry.sha384,
					files: [{name: entry.id, bytes: entry.bytes, sri: entry.sha384}]});
				await installed('letters-' + entry.id);
				const bytes = (await provider.bytes())[entry.id];
				const set = globalThis.RapierDrawLetters.admitLetterSet(bytes);
				if (!set || 'rapier-letters-' + set.id !== file.id) throw new Error('The editor letter set is invalid: ' + file.id);
				if (!globalThis.RapierDrawLetters.holdLetterSet(set)) throw new Error('The editor letter set could not be held: ' + set.id);
				return set;
			}));
			const missed = settled.filter(row => row.status === 'rejected').map(row => row.reason);
			if (missed.length) throw new AggregateError(missed, 'Some letter sets are unavailable');
		})();
		needs.set(id, needed);
		needed.catch(() => { if (needs.get(id) === needed) needs.delete(id); });
		return needed;
	}
	return Object.freeze({
		has: id => known.has(id), need,
		async portable(ids) {
			const out = {groups: [], bodies: new Map()};
			for (const group of groups.filter(group => ids.includes(group.id))) {
				let body;
				try { body = await load(group); } catch (_) { continue; }
				const {asset, ...carried} = group;
				out.groups.push(carried);
				out.bodies.set(group.id, '<script type="application/rapier-runtime" id="' + group.element + '">' + body + '</script>\n');
			}
			return out;
		},
		async ready() {
			const settle = (label, work) => Promise.race([
				Promise.resolve().then(work).catch(error => { try { console.warn('[rapier] started without ' + label, error); } catch (_) {} }),
				new Promise(resolve => setTimeout(resolve, 8000)),
			]);
			await Promise.all(groups.filter(group => !group.asset && !['letters', 'font-subset'].includes(group.id))
				.map(group => settle(group.id, () => load(group).then(() => installed(group.id)))));
			if (groups.some(group => group.id === 'letters' && !group.asset)) await settle('some letter sets', () => need('letters'));
		},
	});
})();
