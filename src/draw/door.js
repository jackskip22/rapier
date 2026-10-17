// SPDX-License-Identifier: AGPL-3.0-only
const RAPIER_HASH_AT_BIRTH = (() => { try { return String(location.hash || ''); } catch (_) { return ''; } })();
const RAPIER_DRAW_DOOR_AT_BIRTH = (() => { try {
	const view = document.getElementById('rapier-document')?.dataset.view;
	if (view === 'draw' || view === 'watercolor') return view;
	const fragment = /^#v\/(draw|watercolor)\/?$/.exec(String(location.hash || ''));
	if (fragment) { history.replaceState(history.state, '', location.pathname + location.search); return fragment[1]; }
	if (/^#v\/notes\/?$/.test(RAPIER_HASH_AT_BIRTH)) return null;
	const path = /^\/(draw|watercolor|paint)\/?$/.exec(String(location.pathname || ''))?.[1];
	if (path) return path;
	return _rapierBareLaunch() && RapierPreferences.read('startIn') === 'paint' ? 'paint' : null;
} catch (_) { return null; } })();
function _rapierBareLaunch() {
	try {
		return window.self === window.top && !RAPIER_HASH_AT_BIRTH && !location.search &&
			!/^\/(?:notes|draw|watercolor|privacy|commercial|agents|paint|markdown-editor|markdown-viewer|markdown-to-pdf|markdown-to-word|word-to-markdown|markdown-table-editor|mermaid-editor)\/?$/.test(String(location.pathname || '')) &&
			!document.getElementById('rapier-document') && globalThis.RAPIER_APPS_HOST !== true &&
			typeof globalThis.RAPIER_PAIRED_DOCUMENT !== 'string' && !window.RapierPlatform?.files?.hasPendingBoot?.();
	} catch (_) { return false; }
}
function _rapierExternalFileRoute(startIn, filePending) {
	if (filePending !== true) return null;
	return startIn === 'notes' ? 'notes' : 'editor';
}
function _nativeIntakeDocumentName(name, contentType) {
	const trimmed = String(name == null ? '' : name).trim();
	if (trimmed) return trimmed;
	const type = String(contentType || '').split(';')[0].trim().toLowerCase();
	if (type === 'text/plain' || type === 'text/txt') return 'shared.txt';
	return 'shared';
}
function _rapierHostFilePending() {
	try { return window.RapierPlatform?.files?.hasPendingBoot?.() === true; } catch (_) { return false; }
}
function _rapierYieldStartToExternalFile() {
	try {
		if (_rapierExternalFileRoute(RapierPreferences.read('startIn'), _rapierHostFilePending()) !== 'editor') return;
	} catch (_) { return; }
	globalThis._rapierExternalFileToEditor = true;
	globalThis._rapierDrawDoorYielded = true;
	_rapierDrawStartClass(false);
	try { document.documentElement.classList.remove('rapier-notes-start'); } catch (_) {}
}
function _rapierDrawStartClass(on) { try { document.documentElement.classList.toggle('rapier-draw-start', on === true); } catch (_) {} }
if (typeof window !== 'undefined' && RAPIER_DRAW_DOOR_AT_BIRTH && _rapierPartAvailable('drawing')) {
	_rapierDrawStartClass(true);
	_rapierPartWait('drawing').catch(error => { _rapierDrawStartClass(false); showToast(String(error?.message || error), 'error'); });
}
if (typeof window !== 'undefined' && !RAPIER_DRAW_DOOR_AT_BIRTH && _rapierPartAvailable('drawing') && globalThis.RapierBenchSession?.active !== true) {
	const kept = async () => {
		if (_rapierNotesDoor?.born) return false;
		if (typeof indexedDB.databases === 'function') {
			try { if (!(await indexedDB.databases()).some(db => db.name === 'rapier-draw')) return false; } catch (_) {}
		}
		return new Promise(done => {
		const request = indexedDB.open('rapier-draw');
		request.onupgradeneeded = () => request.transaction.abort();
		request.onerror = () => done(false);
		request.onsuccess = () => {
			const db = request.result;
			try { const count = db.transaction('pending').objectStore('pending').count(); count.onsuccess = () => done(count.result > 0); count.onerror = () => done(false); }
			catch (_) { done(false); } finally { db.close(); }
		};
		});
	};
	_rapierBootFactsPublished.then(kept).then(found => found && RapierParts.need('drawing')).catch(() => {});
}
if (typeof window !== 'undefined') {
	window.addEventListener('rapier:platform-state', _rapierYieldStartToExternalFile);
	_rapierYieldStartToExternalFile();
}
function _rapierDrawShown() { return !!_rapierDrawPart?.state.open; }
async function _rapierDrawResumeFinishes() {
	const embedded = globalThis.RapierEmbeddedImages, running = _rapierDrawResumeFinishes;
	const inspect = globalThis.RapierImageInspection?.inspectDrawing;
	if (running.busy || !_rapierDrawOffered() || !embedded || !inspect) return;
	if (typeof _rapierDefaultImageProfile === 'function' && _rapierDefaultImageProfile() !== 'jxl') return;
	running.busy = true;
	const scope = rapier.identity.authority, pause = ms => new Promise(done => setTimeout(done, ms));
	const ready = async () => {
		for (let waited = 0; (_rapierDrawShown() || !embedded.canFinishLater()) && waited <= 600000; waited += 2000) {
			if (scope !== rapier.identity.authority) return false;
			await pause(2000);
		}
		return scope === rapier.identity.authority && !_rapierDrawShown() && embedded.canFinishLater();
	};
	try {
		if (await embedded.whenJxlDisplayKnown?.() === false) return;
		for (const label of [...embedded.index().index.assets.keys()]) {
			await pause(0);
			if (scope !== rapier.identity.authority) return;
			const record = embedded.index().index.assets.get(label);
			if (record?.codec !== 'image/svg+xml' || record.status !== 'unverified') continue;
			let text, recipe, size, paintPixels, resources;
			try {
				const inspected = await inspect(record.url, {kind: 'paint'});
				if (!inspected) continue;
				({text, recipe, size, paintPixels, resources} = inspected);
			} catch (_) { continue; }
			if (scope !== rapier.identity.authority) return;
			if (embedded.index().index.assets.get(label)?.url !== record.url) continue;
			_rapierDrawAdoptInspection(resources);
			const waiting = recipe?.shapes.filter(shape => shape.recognized === 'paint' && shape.raster?.startsWith('data:image/png;')) || [];
			if (!waiting.length) continue;
			const rasters = waiting.map(shape => [shape.id, shape.raster]);
			const spelled = /^\[([^\]]+)\]/.exec(record.source)?.[1];
			if (!spelled) continue;
			if (!await ready()) return;
			await embedded.finishLater({
				asset: {...record, label: spelled, ...size}, title: record.title, resumed: true, busy: _rapierDrawShown,
				final: async report => {
					await RapierParts.need('drawing');
					const pixels = paintPixels; paintPixels = null;
					return _rapierDrawPart.finishPaint({recipe, rasters, text, pixels}, report);
				},
			});
		}
		await _rapierDrawLiquidResume();
	} catch (error) { console.warn('[rapier] resume finish', error); }
	finally {
		running.busy = false;
		if (scope !== rapier.identity.authority) void _rapierDrawResumeFinishes();
	}
}
async function _rapierDrawLiquidResume() {
	const assets = globalThis.RapierImageAssets, embedded = globalThis.RapierEmbeddedImages, core = globalThis.RapierDrawCore;
	const running = _rapierDrawLiquidResume, scope = rapier.identity.authority;
	const inspect = globalThis.RapierImageInspection?.inspectDrawing;
	if (running.busy || !_rapierDrawOffered() || !assets || !embedded?.canFinishLater?.() || !inspect) return;
	running.busy = true;
	try {
		for (const label of [...embedded.index().index.assets.keys()]) {
			await new Promise(resolve => setTimeout(resolve, 0));
			if (scope !== rapier.identity.authority || _rapierDrawShown()) return;
			const record = embedded.index().index.assets.get(label);
			if (record?.codec !== 'image/svg+xml') continue;
			let text, recipe, size, resources;
			try {
				const inspected = await inspect(record.url, {kind: 'liquid'});
				if (!inspected) continue;
				({text, recipe, size, resources} = inspected);
			} catch (_) { continue; }
			if (scope !== rapier.identity.authority || _rapierDrawShown()) return;
			if (!recipe || embedded.index().index.assets.get(label)?.url !== record.url) continue;
			_rapierDrawAdoptInspection(resources);
			core.liquidStillsWanted();
			_rapierDrawBuildSVG(recipe, undefined, true);
			if (!core.liquidStillsWanted().length) continue;
			const spelled = /^\[([^\]]+)\]/.exec(record.source)?.[1], defs = /<defs>([\s\S]*?)<\/defs>/.exec(text)?.[1] || '';
			if (!spelled) continue;
			await embedded.finishLater({
				asset: { ...record, label: spelled, ...size }, title: record.title, resumed: true, busy: _rapierDrawShown,
				final: async report => { await RapierParts.need('drawing'); return _rapierDrawPart.finishLiquid(recipe, defs, report); },
			});
		}
	} catch (error) { console.warn('[rapier] liquid light still', error); }
	finally { running.busy = false; }
}
