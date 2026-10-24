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
function _rapierNotesSyncReachable() {
	const environment = globalThis.RapierPlatform?.environment;
	return environment?.android === true || environment?.network !== false;
}
let _rapierNotesDoorsShown = false;
function _rapierNotesShowDoors() {
	_rapierNotesDoorsShown = true;
	const open = document.getElementById('notes-open-btn'); if (open) open.hidden = false;
	const sync = document.getElementById('notes-sync-btn'); if (sync) sync.hidden = !_rapierNotesSyncReachable();
	const other = document.getElementById('notes-sync-other-btn');
	if (other) other.hidden = globalThis.RapierPlatform?.environment?.native === true || !_rapierNotesSyncReachable();
	const start = document.getElementById('settings-start-section');
	if (start) start.hidden = _rapierEmbed.active || globalThis.RAPIER_APPS_HOST === true || window.self !== window.top || typeof globalThis.RAPIER_PAIRED_DOCUMENT === 'string';
}
if (typeof window !== 'undefined') window.addEventListener('rapier:platform-state', () => { if (_rapierNotesDoorsShown) _rapierNotesShowDoors(); });
const _rapierNotesDoor = (() => {
	if (!_rapierPartAvailable('notes') || globalThis.RapierBenchSession?.active === true) return;
	let born = false;
	try { born = RAPIER_NOTES_URL_AT_BIRTH.startsWith('#n/') || RAPIER_NOTES_DOOR_AT_BIRTH || (_rapierBareLaunch() && RapierPreferences.read('startIn') === 'notes'); } catch (_) {}
	if (born) {
		_rapierNotesStartClass(true);
		_rapierPartWait('notes').catch(error => {
			_rapierNotesStartClass(false);
			document.querySelector('[data-rapier-early-part="notes"]')?.remove();
			showToast('Couldn’t open Notes.', 'error', null, error);
		});
	}
	for (const name of ['rapierNotesStart', 'rapierNotesWidgetOpen', 'rapierNotesReceiveShares', 'rapierNotesReceiveReminderActions']) {
		const entry = (...args) => _rapierPartWait('notes').then(() => {
			if (globalThis[name] === entry) throw new Error('The Notes part did not answer ' + name);
			return globalThis[name](...args);
		});
		globalThis[name] = entry;
	}
	_rapierBootFactsPublished.then(() => {
		_rapierNotesShowDoors();
		const beside = document.getElementById('notes-beside-btn');
		if (beside) beside.hidden = !['web', 'linux', 'windows'].includes(globalThis.RapierPlatform?.environment.id) || window.self !== window.top;
	});
	document.addEventListener('click', evt => {
		if (_rapierNotesPart) return;
		const open = evt.target.closest?.('[data-action="notes-open"]'), sync = evt.target.closest?.('[data-action="notes-sync"]'),
			other = evt.target.closest?.('[data-action="notes-sync-other"]');
		if (!open && !sync && !other) return;
		try { const overlay = _rapierUi?.refs?.settingsOverlay; if (overlay) closeDialog(overlay); } catch (_) {}
		void _rapierPartReady('notes').then(done => { if (done) void (open ? _rapierNotesPart.open() : _rapierNotesPart.syncPress(other ? {others: true} : {})); });
	});
	document.addEventListener('click', evt => {
		if (!evt.target.closest?.('[data-action="notes-beside"]')) return;
		try { const overlay = _rapierUi?.refs?.settingsOverlay; if (overlay) closeDialog(overlay); } catch (_) {}
		_rapierNotesBeside();
	});
	return Object.freeze({born});
})();
function _rapierNotesBeside(on, now = false) {
	const frame = document.getElementById('rapier-notes-beside');
	on ??= !frame;
	const away = !on && !now && frame?.contentWindow?.RapierNotesBeside;
	if (away) return void away.leave();
	if (on && !frame) {
		const made = document.createElement('iframe');
		made.id = 'rapier-notes-beside'; made.title = 'notes';
		made.src = location.pathname + location.search + '#v/notes';
		document.documentElement.append(made);
	}
	if (!on) frame?.remove();
	document.body.classList.toggle('rapier-notes-beside', on);
	document.getElementById('notes-beside-btn')?.setAttribute('aria-pressed', String(on));
}
function _rapierNotesBesideHost() { try { return window.frameElement?.id === 'rapier-notes-beside' ? parent.RapierNotesBeside : null; } catch (_) { return null; } }
globalThis.RapierNotesBeside = Object.freeze({
	leave: () => typeof _rapierNotesEditor === 'function' ? _rapierNotesEditor() : _rapierNotesBesideHost()?.close(window),
	close: from => { const frame = document.getElementById('rapier-notes-beside'); if (!frame || frame.contentWindow !== from) return false; _rapierNotesBeside(false, true); return true; },
	open: payload => rapierOpenPlatformPayload(payload),
});
