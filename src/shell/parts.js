// SPDX-License-Identifier: AGPL-3.0-only
const RapierParts = (() => {
	const PINS = /* RAPIER_PARTS */ null;
	const CDN = 'https://cdn.jsdelivr.net/gh/jackskip22/rapier@v1.2.37/';
	const PART_DIRECTORY = 'parts/';
	const pins = new Map((PINS || []).map((pin, order) => [pin.id, {...pin, order}]));
	const runs = new Map(), states = new Map(), kept = new Set(), updates = new Map(), noted = new Set();
	const FORMAT = 1, READS = [1];
	const local = () => ['android', 'windows', 'linux', 'native'].includes(window.RapierPlatform?.environment.id);
	let cache = null;
	const store = () => cache ||= RapierBundleIO.store('parts');
	const say = (id, status, error, progress = null) => {
		states.set(id, {status, error: error ? String(error.message || error) : null, progress, ...(updates.has(id) ? {update: updates.get(id)} : {})});
		dispatchEvent(new CustomEvent('rapier:part', {detail: {id, ...states.get(id)}}));
	};
	const verified = (pin, bytes, source) => RapierBundleIO.verifySha384(bytes, pin.sri,
		{source, byteLength: pin.bytes, sizeMessage: 'unexpected size from ' + source});
	const sealed = () => {
		const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '';
		const connect = /(?:^|;)\s*connect-src([^;]*)/.exec(policy) || /(?:^|;)\s*default-src([^;]*)/.exec(policy);
		if (!connect) return false;
		const sources = connect[1].trim().split(/\s+/);
		if (sources.includes("'self'") || sources.includes(new URL(CDN).origin)) return false;
		const hosted = !document.getElementById('rapier-document') && RapierBundleIO.hostedUrl('');
		return !hosted || !sources.includes(new URL(hosted).origin);
	};
	const carried = pin => {
		const element = document.getElementById('rapier-part-' + pin.id);
		return element?.tagName === 'SCRIPT' && element.type === 'application/rapier-runtime' ? element : null;
	};
	async function stored(pin) {
		const record = await store().get(pin.file).catch(() => null);
		if (!record?.bytes) return null;
		try { return await verified(pin, record.bytes, 'stored copy'); }
		catch (error) {
			if (/secure hash API unavailable/.test(String(error?.message))) throw error;
			await store().remove(pin.file).catch(() => {});
			return null;
		}
	}
	async function fetched(pin) {
		const hosted = RapierBundleIO.hostedUrl(pin.file) || RapierBundleIO.pluginUrl(pin.file);
		const urls = hosted ? [hosted] : [RapierBundleIO.sameOriginUrl(PART_DIRECTORY + pin.file), CDN + PART_DIRECTORY + pin.file].filter(Boolean);
		let failure = null;
		for (const url of urls) {
			const onBytes = at => say(pin.id, 'downloading', null, at / pin.bytes);
			try { return await verified(pin, await RapierBundleIO.fetchBytes(url, 60000, {length: pin.bytes, cache: 'no-store', onBytes}), RapierBundleIO.shortUrl(url)); }
			catch (error) {
				if (!/SHA-384|unexpected size/.test(String(failure?.message))) failure = error;
			}
		}
		throw failure || new Error('could not download ' + pin.id);
	}
	async function body(pin) {
		if (document.readyState === 'loading') await new Promise(done => document.addEventListener('DOMContentLoaded', done, {once: true}));
		const element = carried(pin);
		if (element) return element.textContent;
		return pin.held ||= held(pin).then(bytes => new TextDecoder('utf-8', {fatal: true}).decode(bytes)).catch(error => { pin.held = null; throw error; });
	}
	async function held(pin) {
		if (sealed()) throw Object.assign(new Error('not in this file'), {code: 'part_not_carried'});
		if (local()) {
			const packed = window.RapierPlatform?.resources?.part?.(pin.id, at => say(pin.id, 'downloading', null, at));
			if (packed) { say(pin.id, 'downloading'); await packed; }
			return fetched(pin);
		}
		let bytes = await stored(pin);
		if (!bytes) {
			const other = await older(pin);
			if (other?.readable) { updates.set(pin.id, {bytes: pin.bytes}); kept.add(pin.id); return other.bytes; }
			if (other && !pin.updating) { updates.set(pin.id, {bytes: pin.bytes, required: true}); throw Object.assign(new Error('The ' + pin.label + ' part needs an update to work with this Rapier'), {code: 'part_update_required'}); }
		}
		if (!bytes) {
			say(pin.id, 'downloading');
			bytes = await fetched(pin);
			if (!await store().put(pin.file, {bytes, savedAt: Date.now(), format: pin.format || FORMAT, sri: pin.sri, size: pin.bytes}).catch(() => false)) return bytes;
			updates.delete(pin.id);
		}
		kept.add(pin.id);
		const others = (await store().keys().catch(() => [])).filter(key => String(key).startsWith('rapier-' + pin.id + '-') && key !== pin.file);
		const dated = await Promise.all(others.map(async key => [key, (await store().get(key).catch(() => null))?.savedAt || 0]));
		for (const [key] of dated.sort((a, b) => b[1] - a[1]).slice(1)) await store().remove(key).catch(() => {});
		return bytes;
	}
	async function run(pin) {
		const text = await body(pin);
		say(pin.id, 'installing');
		const spans = await _rapierInflateVendor('rapier-part-' + pin.id, text);
		const names = ['-shared.js', '-styles.json', '.js'].map(end => 'rapier-part-' + pin.id + end);
		if (spans.length !== 3 || spans.some((span, index) => span.name !== names[index])) throw new Error('The ' + pin.id + ' part is incomplete');
		if (pin.id === 'drawing') await RapierBundledPlugins.need('letters');
		pin.started = true;
		await _rapierExecuteBootSource(spans[0]);
		const later = [...document.querySelectorAll('style[data-rapier-part]')].find(sheet => Number(sheet.dataset.rapierPart) > pin.order);
		const sheets = _rapierStyleElements(spans[1].source, later ? later.previousElementSibling
			: [...document.querySelectorAll('head > style[id^="rapier-"]:not([data-rapier-part])')].at(-1));
		for (const sheet of sheets) sheet.dataset.rapierPart = String(pin.order);
		await _rapierExecuteBootSource(spans[2]);
	}
	async function older(pin) {
		const keys = (await store().keys().catch(() => [])).filter(key => String(key).startsWith('rapier-' + pin.id + '-') && key !== pin.file);
		let best = null;
		for (const key of keys) {
			const record = await store().get(key).catch(() => null);
			if (record?.bytes && (!best || (record.savedAt || 0) > (best.record.savedAt || 0))) best = {key, record};
		}
		if (!best) return null;
		const {record} = best;
		if (!READS.includes(record.format) || !record.sri || !record.size) return {key: best.key, readable: false};
		try { return {key: best.key, readable: true, bytes: await RapierBundleIO.verifySha384(record.bytes, record.sri, {source: 'stored copy', byteLength: record.size, sizeMessage: 'unexpected size of the stored copy'})}; }
		catch (error) { if (/secure hash API unavailable/.test(String(error?.message))) throw error; await store().remove(best.key).catch(() => {}); return null; }
	}
	async function update(id) {
		const pin = pins.get(id);
		if (!pin) throw new Error('This Rapier does not carry ' + id);
		if (local() || carried(pin) || sealed()) throw new Error('This copy of Rapier cannot update ' + pin.label + '.');
		const before = states.get(id)?.status || 'absent';
		say(id, 'downloading');
		let bytes;
		try { bytes = await fetched(pin); }
		catch (error) { say(id, before, error); throw error; }
		if (!await store().put(pin.file, {bytes, savedAt: Date.now(), format: pin.format || FORMAT, sri: pin.sri, size: pin.bytes}).catch(() => false)) throw new Error('This device has no room to keep ' + pin.label + '.');
		for (const key of (await store().keys().catch(() => [])).filter(key => String(key).startsWith('rapier-' + id + '-') && key !== pin.file)) await store().remove(key).catch(() => {});
		kept.add(id); updates.delete(id); pin.updating = false;
		pin.held = Promise.resolve(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
		say(id, runs.has(id) ? 'ready' : 'stored');
		return true;
	}
	function need(id) {
		const pin = pins.get(id);
		if (!pin) return Promise.reject(Object.assign(new Error('This Rapier does not carry ' + id), {code: 'part_unavailable', part: id}));
		if (runs.has(id)) return runs.get(id);
		const running = run(pin).then(() => {
			say(id, 'ready');
			const waiting = updates.get(id);
			if (waiting && !waiting.required && !noted.has(id)) {
				noted.add(id);
				try { window.dispatchEvent(new CustomEvent('rapier:plugin-update', {detail: {key: id, noun: pin.label, plural: false, version: pin.sri, bytes: waiting.bytes}})); } catch (_) {}
			}
		}, error => {
			if (!pin.started) runs.delete(id);
			if (error?.code === 'part_update_required') { say(id, 'absent'); throw error; }
			if (error?.code === 'part_not_carried') say(id, 'absent');
			else {
				say(id, 'error', error);
				try { console.error('[rapier] the ' + id + ' part did not start', error); } catch (_) {}
			}
			const noun = id === 'drawing' ? 'Draw' : pin.label;
			throw Object.assign(new Error(pin.started ? 'The ' + pin.label + ' part could not start. Reload Rapier.'
				: /^Google Play /.test(String(error?.message)) ? error.message
				: error?.code === 'part_not_carried' ? 'This file was saved without ' + noun + '. Open it at rapier.website to use ' + noun + '.'
				: 'The ' + pin.label + ' part could not be loaded: ' + String(error?.message || error)), {code: 'part_unavailable', part: id, cause: error});
		});
		runs.set(id, running);
		return running;
	}
	async function forget(id) {
		const pin = pins.get(id);
		if (!pin) return false;
		for (const key of (await store().keys().catch(() => [])).filter(key => key === pin.file || String(key).startsWith('rapier-' + id + '-'))) await store().remove(key).catch(() => {});
		kept.delete(id); updates.delete(id);
		say(id, 'absent');
		return true;
	}
	async function element(id) {
		const pin = pins.get(id);
		if (!pin) throw new Error('This Rapier does not carry ' + id);
		return '<script type="application/rapier-runtime" id="rapier-part-' + id + '">' + await body(pin) + '</script>\n';
	}
	async function check(id) {
		const pin = pins.get(id);
		if (!pin || runs.has(id) || carried(pin)) return RapierParts.status(id);
		const record = local() ? null : await store().get(pin.file).catch(() => null);
		if (record?.bytes) kept.add(id);
		const other = local() || record?.bytes ? null : await older(pin).catch(() => null);
		if (other) { updates.set(id, other.readable ? {bytes: pin.bytes} : {bytes: pin.bytes, required: true}); if (other.readable) kept.add(id); }
		else updates.delete(id);
		if (!runs.has(id)) say(id, local() ? 'carried' : record?.bytes ? 'stored' : other?.readable ? 'stored' : 'absent');
		return states.get(id);
	}
	return Object.freeze({
		has: id => pins.has(id),
		ready: id => states.get(id)?.status === 'ready',
		status: id => states.get(id) || (pins.has(id) ? {status: carried(pins.get(id)) || local() ? 'carried' : 'absent', error: null} : null),
		ids: () => [...pins.keys()],
		pin: id => pins.has(id) ? {id, label: pins.get(id).label, file: pins.get(id).file, bytes: pins.get(id).bytes, sri: pins.get(id).sri} : null,
		deletable: id => kept.has(id),
		need, check, forget, update, element, sealed,
	});
})();
