// SPDX-License-Identifier: AGPL-3.0-only
const _rapierJxlDoor = (() => {
	if (!_rapierPartAvailable('jxl') || globalThis.RapierBenchSession?.active === true) return null;
	let born = false;
	try {
		if (document.getElementById('rapier-document')?.dataset.view === 'jxl') born = true;
		else if (/^#v\/jxl\/?$/.test(String(location.hash || ''))) { history.replaceState(history.state, '', location.pathname + location.search); born = true; }
		else born = /^\/jxl\/?$/.test(String(location.pathname || ''));
	} catch (_) {}
	if (born) {
		try { document.documentElement.classList.add('rapier-jxl-start'); } catch (_) {}
		_rapierPartWait('jxl').catch(error => { document.documentElement.classList.remove('rapier-jxl-start'); showToast(String(error?.message || error), 'error'); });
	}
	return Object.freeze({born});
})();
