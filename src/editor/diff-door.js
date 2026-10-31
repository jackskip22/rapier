// SPDX-License-Identifier: AGPL-3.0-only
const _rapierDiffDoor = (() => {
	if (!_rapierPartAvailable('diff') || globalThis.RapierBenchSession?.active === true) return null;
	let born = false;
	try {
		if (document.getElementById('rapier-document')?.dataset.view === 'diff') born = true;
		else if (/^#v\/diff\/?$/.test(String(location.hash || ''))) { history.replaceState(history.state, '', location.pathname + location.search); born = true; }
		else born = /^\/diff\/?$/.test(String(location.pathname || ''));
	} catch (_) {}
	if (born) {
		try { document.documentElement.classList.add('rapier-diff-start'); } catch (_) {}
		_rapierPartWait('diff').catch(error => {
			document.documentElement.classList.remove('rapier-diff-start');
			showToast(_rapierErrorWords(error, 'Couldn’t open Compare.'), 'error');
		});
	}
	return Object.freeze({born});
})();
