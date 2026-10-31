// SPDX-License-Identifier: AGPL-3.0-only
const _rapierDiagramsDoor = (() => {
	if (!_rapierPartAvailable('diagrams') || globalThis.RapierBenchSession?.active === true) return null;
	let born = false;
	try {
		if (document.getElementById('rapier-document')?.dataset.view === 'diagrams') born = true;
		else if (/^#v\/diagrams\/?$/.test(String(location.hash || ''))) { history.replaceState(history.state, '', location.pathname + location.search); born = true; }
		else born = /^\/diagrams\/?$/.test(String(location.pathname || ''));
	} catch (_) {}
	if (born) {
		try { document.documentElement.classList.add('rapier-diagrams-start'); } catch (_) {}
		_rapierPartWait('diagrams').catch(error => {
			document.documentElement.classList.remove('rapier-diagrams-start');
			showToast(_rapierErrorWords(error, 'Couldn’t open Diagrams.'), 'error');
		});
	}
	return Object.freeze({born});
})();
