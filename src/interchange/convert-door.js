// SPDX-License-Identifier: AGPL-3.0-only
const _rapierConvertDoor = (() => {
	if (!_rapierPartAvailable('convert') || globalThis.RapierBenchSession?.active === true) return null;
	const MAKES = {convert: 'md', 'word-to-markdown': 'md', 'pdf-to-markdown': 'md', 'markdown-to-word': 'docx', 'markdown-to-pdf': 'pdf'};
	let door = '';
	try {
		if (document.getElementById('rapier-document')?.dataset.view === 'convert') door = 'convert';
		else if (/^#v\/convert\/?$/.test(String(location.hash || ''))) { history.replaceState(history.state, '', location.pathname + location.search); door = 'convert'; }
		else {
			const path = String(location.pathname || '').replace(/^\/|\/$/g, '');
			if (Object.hasOwn(MAKES, path)) door = path;
		}
	} catch (_) {}
	if (door) {
		try { document.documentElement.classList.add('rapier-convert-start'); } catch (_) {}
		_rapierPartWait('convert').catch(error => {
			document.documentElement.classList.remove('rapier-convert-start');
			showToast(_rapierErrorWords(error, 'Couldn’t open the converter.'), 'error');
		});
	}
	return Object.freeze({born: !!door, door, makes: MAKES[door] || 'md'});
})();
