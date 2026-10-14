// SPDX-License-Identifier: AGPL-3.0-only

const RAPIER_NOTES_URL_AT_BIRTH = (() => { try { return String(location.hash || ''); } catch (_) { return ''; } })();
const RAPIER_NOTES_DOOR_AT_BIRTH = (() => { try {
	if (document.getElementById('rapier-document')?.dataset.view === 'notes') return true;
	if (/^#v\/notes\/?$/.test(RAPIER_NOTES_URL_AT_BIRTH)) { history.replaceState(history.state, '', location.pathname + location.search); return true; }
	return /^\/notes\/?$/.test(String(location.pathname || ''));
} catch (_) { return false; } })();
function _rapierNotesStartClass(on) {
	try { document.documentElement.classList.toggle('rapier-notes-start', on === true); } catch (_) {}
}
const _rapierNotesDoor = (() => {
	if (!_rapierPartAvailable('notes') || globalThis.RapierBenchSession?.active === true) return null;
	let born = false;
	try { born = RAPIER_NOTES_URL_AT_BIRTH.startsWith('#n/') || ((RAPIER_NOTES_DOOR_AT_BIRTH || RapierPreferences.read('notesStart') === 'notes') && !RAPIER_NOTES_URL_AT_BIRTH.startsWith('#d/')); } catch (_) {}
	if (born) {
		_rapierNotesStartClass(true);
		_rapierPartWait('notes').catch(error => { _rapierNotesStartClass(false); showToast(String(error?.message || error), 'error'); });
	}
	const ready = () => typeof _rapierNotesOpen === 'function';
	for (const name of ['rapierNotesStart', 'rapierNotesWidgetOpen', 'rapierNotesReceiveShares', 'rapierNotesReceiveReminderActions']) {
		const entry = (...args) => _rapierPartWait('notes').then(() => {
			if (globalThis[name] === entry) throw new Error('The Notes part did not answer ' + name);
			return globalThis[name](...args);
		});
		globalThis[name] = entry;
	}
	_rapierBootFactsPublished.then(() => {
		for (const id of ['notes-open-btn', 'switch-notes-start', 'notes-sync-btn']) { const el = document.getElementById(id); if (el) el.hidden = false; }
	});
	document.addEventListener('click', evt => {
		if (ready()) return;
		const open = evt.target.closest?.('[data-action="notes-open"]'), sync = evt.target.closest?.('[data-action="notes-sync"]');
		if (!open && !sync) return;
		if (open) try { const overlay = _rapierUi?.refs?.settingsOverlay; if (overlay) closeDialog(overlay); } catch (_) {}
		void _rapierPartReady('notes').then(done => { if (done) void (open ? _rapierNotesOpen() : _rapierNotesSyncPress()); });
	});
	return Object.freeze({ready});
})();
