// SPDX-License-Identifier: AGPL-3.0-only
import {admitFontFamily, FONT_CATALOG_LIMITS} from './catalog.mjs';

// The browsing sheet supplies the existing progress/notice owners. Add has no document or selection authority.
export function createFontLibrary({families, baseUrl, loader, fonts, progress, outcome}) {
	if (!Array.isArray(families) || families.length > FONT_CATALOG_LIMITS.families || typeof loader?.data !== 'function' ||
		typeof fonts?.add !== 'function' || typeof fonts?.installed !== 'function' || typeof fonts?.preview !== 'function' ||
		typeof progress !== 'function' || typeof outcome !== 'function') throw new TypeError('Font library owners are required.');
	const catalog = new Map(), pending = new Map();
	let tail = Promise.resolve();
	function assetUrl(value) {
		let url;
		try { url = new URL(value, baseUrl); } catch (_) { throw new TypeError('A font asset needs its catalog URL.'); }
		if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new TypeError('Font assets need an HTTPS URL.');
		return url.href;
	}
	for (const raw of families) {
		const family = admitFontFamily(raw);
		if (catalog.has(family.id)) throw new TypeError('Duplicate font family.');
		for (const file of [...family.files, family.license]) assetUrl(file.url);
		catalog.set(family.id, family);
	}
	function familyFor(id) {
		const family = catalog.get(id);
		if (!family) throw Object.assign(new Error('Font family missing.'), {code: 'font_family_missing'});
		return family;
	}
	async function kept(family) {
		await fonts.ready;
		return fonts.installed(family.id).filter(font => font.origin?.catalog === 'google-fonts' && font.origin.family === family.id &&
			font.origin.version === family.version && font.license?.sri === family.license.sri);
	}
	const complete = (family, held) => family.files.every(file => held.some(font => font.origin.sri === file.sri));
	const licensesFor = held => [...new Map(held.filter(font => font.license).map(font => [font.license.sri, font.license])).values()];
	function say(value) { try { outcome(value); } catch (error) { console.error('[rapier] font outcome:', error); } }
	async function add(family) {
		const row = progress({label: 'Adding font', after: 500});
		let result;
		try {
			let held = await kept(family), reused = complete(family, held);
			if (!reused) {
				const files = [...family.files, family.license].map(file => ({name: file.name, url: assetUrl(file.url), bytes: file.bytes, sri: file.sri.slice(7)}));
				const provider = loader.data({key: 'font-' + family.id, noun: 'font', dash: ' — ', version: family.version, files,
					onStatus: state => row.set(state.status === 'downloading' ? state.progress / 100 : null)});
				await provider.install();
				const values = await provider.bytes();
				const license = {id: family.license.id, text: new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(values[family.license.name]),
					url: family.license.sourceUrl || assetUrl(family.license.url), sri: family.license.sri};
				row.set(null);
				const imported = await fonts.add(family.files.map(file => ({name: file.name, bytes: values[file.name], license,
					origin: {catalog: 'google-fonts', family: family.id, version: family.version, file: file.name, sri: file.sri}})));
				held = await kept(family);
				if (imported.refused.length || !complete(family, held)) throw Object.assign(new Error('Couldn’t add the complete font family.'),
					{code: 'font_family_incomplete', refused: imported.refused, fonts: imported.fonts});
			}
			await Promise.all(held.map(font => fonts.preview(font)));
			result = Object.freeze({status: 'installed', family: family.id, fonts: Object.freeze(held), licenses: Object.freeze(licensesFor(held)), reused});
		} catch (error) {
			result = Object.freeze({status: 'error', family: family.id, error});
			throw error;
		} finally {
			row.end();
			if (result) say(result);
		}
		return result;
	}
	return Object.freeze({
		install(id) {
			const family = familyFor(id);
			if (!pending.has(id)) {
				// Keep one family's decoded faces in flight on a phone; one loader downloads its files three at a time.
				const work = tail.then(() => add(family));
				tail = work.catch(() => {});
				pending.set(id, work);
				work.then(() => pending.delete(id), () => pending.delete(id));
			}
			return pending.get(id);
		},
		async installed(id) { const family = familyFor(id); return complete(family, await kept(family)); },
		async licenses(id) { return licensesFor(await kept(familyFor(id))); },
	});
}
