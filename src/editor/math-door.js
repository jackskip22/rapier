// SPDX-License-Identifier: AGPL-3.0-only
const _rapierMathDoor = (() => {
	if (!_rapierPartAvailable('mathview') || globalThis.RapierBenchSession?.active === true) return null;
	let born = false;
	try {
		if (document.getElementById('rapier-document')?.dataset.view === 'math') born = true;
		else if (/^#v\/math\/?$/.test(String(location.hash || ''))) { history.replaceState(history.state, '', location.pathname + location.search); born = true; }
		else born = /^\/math\/?$/.test(String(location.pathname || ''));
	} catch (_) {}
	if (born) {
		try { document.documentElement.classList.add('rapier-math-start'); } catch (_) {}
		_rapierPartWait('mathview').catch(error => {
			document.documentElement.classList.remove('rapier-math-start');
			showToast(_rapierErrorWords(error, 'Couldn’t open the equation editor.'), 'error');
		});
	}
	return Object.freeze({born});
})();
